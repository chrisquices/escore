<?php

namespace Strata\PHPStan;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\Query\Builder as QueryBuilder;
use PhpParser\Node;
use PhpParser\Node\Expr;
use PhpParser\Node\Expr\Array_;
use PhpParser\Node\Expr\ArrowFunction;
use PhpParser\Node\Expr\Assign;
use PhpParser\Node\Expr\Closure;
use PhpParser\Node\Expr\MethodCall;
use PhpParser\Node\Expr\NullsafeMethodCall;
use PhpParser\Node\Expr\StaticCall;
use PhpParser\Node\Expr\Variable;
use PhpParser\Node\Identifier;
use PhpParser\Node\Name;
use PhpParser\Node\Scalar\String_;
use PhpParser\Node\Stmt\ClassMethod;
use PhpParser\Node\Stmt\Expression;
use PhpParser\Node\Stmt\Return_;
use PhpParser\NodeFinder;
use PHPStan\Analyser\Scope;
use PHPStan\Parser\Parser;
use PHPStan\Reflection\ClassReflection;
use PHPStan\Rules\Rule;
use PHPStan\Rules\RuleError;
use PHPStan\Rules\RuleErrorBuilder;
use PHPStan\Type\NeverType;
use PHPStan\Type\ObjectType;
use PHPStan\Type\Type;
use PHPStan\Type\TypeCombinator;
use PHPStan\Type\UnionType;

/**
 * @implements Rule<Node>
 */
class EloquentRules implements Rule
{
    public function __construct(private Parser $parser) {}

    public function getNodeType(): string
    {
        return Node::class;
    }

    /**
     * @return list<RuleError>
     */
    public function processNode(Node $node, Scope $scope): array
    {
        return [
            ...$this->enforceQueryUsage($node, $scope),
            ...$this->enforceArraySelectArguments($node, $scope),
            ...$this->enforceEagerLoadColumns($node, $scope),
        ];
    }

    /** @return list<RuleError> */
    private function enforceQueryUsage(Node $node, Scope $scope): array
    {
        if (! $node instanceof MethodCall && ! $node instanceof NullsafeMethodCall) {
            return [];
        }

        // PHPStan also visits a synthetic MethodCall for each nullsafe call.
        if ($node->getAttribute('virtualNullsafeMethodCall', false)) {
            return [];
        }

        $queryType = TypeCombinator::union(new ObjectType(Builder::class), new ObjectType(QueryBuilder::class), new ObjectType(Relation::class));
        $root = $node;
        $callCount = 1;

        while ($root instanceof MethodCall || $root instanceof NullsafeMethodCall) {
            if ($root->isFirstClassCallable() || ! $queryType->isSuperTypeOf(TypeCombinator::removeNull($scope->getType($root->var)))->yes()) {
                return [];
            }

            $callCount++;

            // Report only at the third call, even when the chain continues.
            if ($callCount > 3) {
                return [];
            }

            $root = $root->var;
        }

        if ($callCount !== 3 || ! $root instanceof StaticCall || ! $root->name instanceof Identifier || $root->isFirstClassCallable() || strtolower($root->name->toString()) === 'query') {
            return [];
        }

        $modelType = $root->class instanceof Name
            ? $scope->resolveTypeByName($root->class)
            : $scope->getType($root->class)->getObjectTypeOrClassStringObjectType();

        if (! (new ObjectType(Model::class))->isSuperTypeOf($modelType)->yes()) {
            return [];
        }

        return [
            RuleErrorBuilder::message('Begin Eloquent query chains of three or more calls with Model::query().')
                ->identifier('strata.eloquent.enforceQueryUsage')
                ->line($root->getStartLine())
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function enforceArraySelectArguments(Node $node, Scope $scope): array
    {
        if (! $node instanceof MethodCall && ! $node instanceof NullsafeMethodCall && ! $node instanceof StaticCall) {
            return [];
        }

        if ($node->getAttribute('virtualNullsafeMethodCall', false) || ! $node->name instanceof Identifier || strtolower($node->name->toString()) !== 'select' || $node->isFirstClassCallable()) {
            return [];
        }

        $arguments = $node->getArgs();

        if ($arguments === []) {
            return [];
        }

        $receiverType = $node instanceof StaticCall
            ? ($node->class instanceof Name
                ? $scope->resolveTypeByName($node->class)
                : $scope->getType($node->class)->getObjectTypeOrClassStringObjectType())
            : TypeCombinator::removeNull($scope->getType($node->var));
        $queryType = TypeCombinator::union(new ObjectType(Model::class), new ObjectType(Builder::class), new ObjectType(QueryBuilder::class), new ObjectType(Relation::class));

        if (! $queryType->isSuperTypeOf($receiverType)->yes()) {
            return [];
        }

        if (count($arguments) === 1 && ! $arguments[0]->unpack) {
            $argumentType = $scope->getType($arguments[0]->value);
            $argumentTypes = $argumentType instanceof UnionType ? $argumentType->getTypes() : [$argumentType];

            if (array_filter($argumentTypes, static fn (Type $type): bool => $type->isArray()->no()) === []) {
                return [];
            }
        }

        return [
            RuleErrorBuilder::message("Pass select() columns as a single array, e.g. select(['id', 'name']).")
                ->identifier('strata.eloquent.enforceArraySelectArguments')
                ->line($node->getStartLine())
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function enforceEagerLoadColumns(Node $node, Scope $scope): array
    {
        if (! $node instanceof MethodCall && ! $node instanceof NullsafeMethodCall && ! $node instanceof StaticCall) {
            return [];
        }

        if ($node->getAttribute('virtualNullsafeMethodCall', false) || ! $node->name instanceof Identifier || strtolower($node->name->toString()) !== 'with' || $node->isFirstClassCallable()) {
            return [];
        }

        $receiverType = $node instanceof StaticCall
            ? ($node->class instanceof Name ? $scope->resolveTypeByName($node->class) : $scope->getType($node->class)->getObjectTypeOrClassStringObjectType())
            : TypeCombinator::removeNull($scope->getType($node->var));
        $modelType = match (true) {
            (new ObjectType(Model::class))->isSuperTypeOf($receiverType)->yes() => $receiverType,
            (new ObjectType(Builder::class))->isSuperTypeOf($receiverType)->yes() => $receiverType->getTemplateType(Builder::class, 'TModel'),
            (new ObjectType(Relation::class))->isSuperTypeOf($receiverType)->yes() => $receiverType->getTemplateType(Relation::class, 'TRelatedModel'),
            default => null,
        };

        if ($modelType === null || ! $receiverType->hasMethod('with')->yes() || ! in_array($receiverType->getMethod('with', $scope)->getDeclaringClass()->getName(), [Model::class, Builder::class], true)) {
            return [];
        }

        $arguments = [];

        foreach ($node->getArgs() as $position => $argument) {
            if ($argument->unpack) {
                return [];
            }

            $arguments[$argument->name?->toString() ?? $position] = $argument->value;
        }

        $relations = $arguments['relations'] ?? $arguments[0] ?? null;
        $callback = $arguments['callback'] ?? $arguments[1] ?? null;

        if ($relations === null) {
            return [];
        }

        if ($callback instanceof Closure || $callback instanceof ArrowFunction) {
            $name = $this->eagerLoadName($relations, $scope);

            // Model::with() accepts variadic names, but not a separate callback.
            if ($name === null || (new ObjectType(Model::class))->isSuperTypeOf($receiverType)->yes()) {
                return [];
            }

            $entries = [['name' => $name, 'selected' => $this->eagerLoadCallbackSelection($callback)]];
        } else {
            $entries = [];

            foreach ($relations instanceof Array_ ? [$relations] : $arguments as $argument) {
                $names = $this->eagerLoadEntries($argument, $scope);

                if ($names === null) {
                    return [];
                }

                $entries = [...$entries, ...$names];
            }
        }

        $selections = [];

        foreach ($entries as $entry) {
            // Conflicting/repeated constraints are outside this bounded analysis.
            $selections[$entry['name']] = array_key_exists($entry['name'], $selections) ? null : $entry['selected'];
        }

        foreach (array_keys($selections) as $name) {
            $parts = explode('.', $name);
            array_pop($parts);

            while ($parts !== []) {
                $parent = implode('.', $parts);

                if (! array_key_exists($parent, $selections)) {
                    $selections[$parent] = false;
                }

                array_pop($parts);
            }
        }

        $errors = [];

        foreach ($selections as $name => $selected) {
            if ($selected !== false || $this->relationColumnSelection($modelType, $name) !== false) {
                continue;
            }

            $errors[] = RuleErrorBuilder::message("Select columns for eager-loaded relationship '{$name}' using column notation, a query callback, or the relationship definition.")
                ->identifier('strata.eloquent.enforceEagerLoadColumns')
                ->line($node->getStartLine())
                ->build();
        }

        return $errors;
    }

    /** @return list<array{name: string, selected: bool|null}>|null */
    private function eagerLoadEntries(Expr $expression, Scope $scope, string $prefix = ''): ?array
    {
        if (! $expression instanceof Array_) {
            $name = $this->eagerLoadName($expression, $scope);

            return $name === null ? null : [$this->eagerLoadEntry($prefix.$name)];
        }

        $entries = [];

        foreach ($expression->items as $item) {
            if ($item === null || $item->unpack) {
                return null;
            }

            if ($item->key === null || $scope->getType($item->key)->isInteger()->yes()) {
                $name = $this->eagerLoadName($item->value, $scope);

                if ($name === null) {
                    return null;
                }

                $entries[] = $this->eagerLoadEntry($prefix.$name);

                continue;
            }

            $name = $this->eagerLoadName($item->key, $scope);

            if ($name === null) {
                return null;
            }

            $entry = $this->eagerLoadEntry($prefix.$name);

            if ($item->value instanceof Array_) {
                $nested = $this->eagerLoadEntries($item->value, $scope, $entry['name'].'.');

                if ($nested === null) {
                    return null;
                }

                $entries = [...$entries, $entry, ...$nested];
            } else {
                // Laravel only parses colon syntax in list values and nested-array keys.
                $entry['selected'] = str_contains($name, ':') ? null : $this->eagerLoadCallbackSelection($item->value);
                $entries[] = $entry;
            }
        }

        return $entries;
    }

    private function eagerLoadName(Expr $expression, Scope $scope): ?string
    {
        $type = $scope->getType($expression);
        $strings = $type->getConstantStrings();

        return $type->isConstantScalarValue()->yes() && count($strings) === 1 ? $strings[0]->getValue() : null;
    }

    /** @return array{name: string, selected: bool} */
    private function eagerLoadEntry(string $name): array
    {
        $parts = explode(':', $name, 2);
        $columns = isset($parts[1]) ? array_filter(explode(',', $parts[1]), static fn (string $column): bool => trim($column) !== '') : [];

        return ['name' => $parts[0], 'selected' => $columns !== []];
    }

    private function eagerLoadCallbackSelection(Expr $callback): ?bool
    {
        if (! $callback instanceof Closure && ! $callback instanceof ArrowFunction) {
            return null;
        }

        $parameter = $callback->params[0]->var ?? null;

        if (! $parameter instanceof Variable || ! is_string($parameter->name)) {
            return null;
        }

        return $this->queryBodySelection($callback instanceof ArrowFunction ? [new Return_($callback->expr)] : $callback->stmts, $parameter->name);
    }

    private function relationColumnSelection(Type $modelType, string $path): ?bool
    {
        $parts = explode('.', $path);

        foreach ($parts as $index => $name) {
            $classes = $modelType->getObjectClassReflections();

            if (count($classes) !== 1 || ! $classes[0]->isSubclassOf(Model::class) || $classes[0]->isAbstract() || ! $classes[0]->hasNativeMethod($name)) {
                return null;
            }

            $class = $classes[0];
            $method = $class->getNativeMethod($name);
            $returnType = $method->getVariants()[0]->getReturnType();

            if (($returnType instanceof NeverType) || ! (new ObjectType(Relation::class))->isSuperTypeOf($returnType)->yes()) {
                return null;
            }

            if ($index < count($parts) - 1) {
                $modelType = $returnType->getTemplateType(Relation::class, 'TRelatedModel');

                continue;
            }

            // Source locations also identify inherited and trait-aliased methods.
            $native = $class->getNativeReflection()->getMethod($name);
            $file = $native->getFileName();

            if ($file === false) {
                return null;
            }

            $methodNode = (new NodeFinder)->findFirst($this->parser->parseFile($file), static fn (Node $candidate): bool => $candidate instanceof ClassMethod
                    && $candidate->getStartLine() === $native->getStartLine()
                    && $candidate->getEndLine() === $native->getEndLine(), );

            return $methodNode instanceof ClassMethod && $methodNode->stmts !== null
                ? $this->queryBodySelection($methodNode->stmts, null, $class)
                : null;
        }

        return null;
    }

    /**
     * Only straight-line bodies and simple aliases are resolved. Null means
     * unknown; it must never produce a missing-selection diagnostic.
     *
     * @param  list<Node\Stmt>  $statements
     */
    private function queryBodySelection(array $statements, ?string $parameter = null, ?ClassReflection $model = null): ?bool
    {
        $aliases = $parameter === null ? [] : [$parameter => 0];
        $selections = $parameter === null ? [] : [0 => false];

        foreach ($statements as $statement) {
            if ($statement instanceof Node\Stmt\Nop) {
                continue;
            }

            if (! $statement instanceof Expression && ! $statement instanceof Return_) {
                return null;
            }

            $expression = $statement->expr;

            if ($expression === null) {
                return $parameter === null ? null : $selections[0];
            }

            $assignment = $expression instanceof Assign && $expression->var instanceof Variable && is_string($expression->var->name) ? $expression : null;
            $queryExpression = $assignment === null ? $expression : $assignment->expr;
            $id = $this->selectedQueryId($queryExpression, $aliases, $selections, $model);

            if ($id === null) {
                // Do not credit unrelated queries or nested callback selections.
                // Passing a tracked query to an unknown helper is unresolved.
                $usesQuery = (new NodeFinder)->findFirst($queryExpression, static fn (Node $candidate): bool => $candidate instanceof Variable
                    && is_string($candidate->name) && array_key_exists($candidate->name, $aliases));

                if ($usesQuery !== null) {
                    return null;
                }
            }

            if ($assignment !== null) {
                if ($id === null) {
                    unset($aliases[$assignment->var->name]);
                } else {
                    $aliases[$assignment->var->name] = $id;
                }
            }

            if ($statement instanceof Return_) {
                return $parameter !== null ? $selections[0] : ($id === null ? null : $selections[$id]);
            }
        }

        return $parameter === null ? null : $selections[0];
    }

    /**
     * @param  array<string, int>  $aliases
     * @param  array<int, bool|null>  $selections
     */
    private function selectedQueryId(Expr $expression, array $aliases, array &$selections, ?ClassReflection $model): ?int
    {
        $calls = [];
        $root = $expression;

        while ($root instanceof MethodCall) {
            if (! $root->name instanceof Identifier || $root->isFirstClassCallable()) {
                return null;
            }

            $calls[] = $root;
            $root = $root->var;
        }

        if (! $root instanceof Variable || ! is_string($root->name)) {
            return null;
        }

        $calls = array_reverse($calls);

        if (array_key_exists($root->name, $aliases)) {
            $id = $aliases[$root->name];
        } elseif ($root->name === 'this' && $model !== null && $calls !== []) {
            $factory = array_shift($calls);
            $name = $factory->name->toString();

            if (! in_array(strtolower($name), ['belongsto', 'hasone', 'hasmany', 'belongstomany', 'hasmanythrough', 'hasonethrough', 'morphone', 'morphmany', 'morphto', 'morphtomany', 'morphedbymany'], true)
                || ! $model->hasNativeMethod($name)
                || ! str_starts_with($model->getNativeMethod($name)->getDeclaringClass()->getName(), 'Illuminate\\Database\\Eloquent\\')) {
                return null;
            }

            $id = spl_object_id($factory);
            $selections[$id] = false;
        } else {
            return null;
        }

        foreach ($calls as $call) {
            // Nested queries do not select the outer query's columns. A callback
            // capturing that outer query, however, can mutate it in unknown ways.
            $usesQuery = (new NodeFinder)->findFirst($call->getArgs(), static fn (Node $candidate): bool => $candidate instanceof Variable
                && is_string($candidate->name) && array_key_exists($candidate->name, $aliases));

            if ($usesQuery !== null) {
                $selections[$id] = null;

                return null;
            }

            $name = strtolower($call->name->toString());

            if (in_array($name, ['select', 'addselect', 'selectraw'], true)) {
                $selected = $this->explicitSelectArguments($call);
                $selections[$id] = $name === 'select' || $selections[$id] !== true ? $selected : true;
            } elseif (! in_array($name, [
                'where', 'orwhere', 'wherenot', 'orwherenot', 'wherein', 'wherenotin',
                'wherenull', 'wherenotnull', 'orwherenull', 'orwherenotnull',
                'wherecolumn', 'wherebetween', 'wherenotbetween', 'whereraw', 'orwhereraw',
                'wheredate', 'whereyear', 'wheremonth', 'whereday', 'wheretime',
                'wherehas', 'orwherehas', 'wheredoesnthave', 'has', 'doesnthave',
                'orderby', 'orderbydesc', 'orderbyraw', 'latest', 'oldest', 'reorder',
                'limit', 'take', 'offset', 'skip', 'distinct', 'groupby', 'having',
                'with', 'without', 'withpivot', 'withtimestamps', 'as',
            ], true)) {
                // Scopes, helpers and conditional callbacks may change the selection.
                $selections[$id] = null;

                return null;
            }
        }

        return $id;
    }

    private function explicitSelectArguments(MethodCall $call): ?bool
    {
        $arguments = $call->getArgs();

        if ($arguments === []) {
            return false;
        }

        $parameter = match (strtolower($call->name->toString())) {
            'selectraw' => 'expression',
            'addselect' => 'column',
            default => 'columns',
        };
        $argument = $arguments[0];

        foreach ($arguments as $candidate) {
            if ($candidate->name?->toString() === $parameter) {
                $argument = $candidate;
                break;
            }
        }

        if ($argument->unpack) {
            return null;
        }

        if ($argument->value instanceof String_) {
            return trim($argument->value->value) !== '';
        }

        if ($argument->value instanceof Array_) {
            foreach ($argument->value->items as $item) {
                if ($item === null || $item->unpack || ! $item->value instanceof String_) {
                    return null;
                }

                if (trim($item->value->value) !== '') {
                    return true;
                }
            }

            return false;
        }

        return null;
    }
}
