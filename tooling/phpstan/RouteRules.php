<?php

namespace Strata\PHPStan;

use Illuminate\Routing\RouteRegistrar;
use Illuminate\Routing\Router;
use Illuminate\Support\Facades\Route as RouteFacade;
use PhpParser\Node;
use PhpParser\Node\Arg;
use PhpParser\Node\Expr;
use PhpParser\Node\Expr\Array_;
use PhpParser\Node\Expr\ArrowFunction;
use PhpParser\Node\Expr\ClassConstFetch;
use PhpParser\Node\Expr\Closure;
use PhpParser\Node\Expr\MethodCall;
use PhpParser\Node\Expr\NullsafeMethodCall;
use PhpParser\Node\Expr\StaticCall;
use PhpParser\Node\FunctionLike;
use PhpParser\Node\Identifier;
use PhpParser\Node\Name;
use PhpParser\Node\Scalar\Int_;
use PhpParser\Node\Scalar\String_;
use PHPStan\Analyser\Scope;
use PHPStan\Node\FileNode;
use PHPStan\Rules\Rule;
use PHPStan\Rules\RuleError;
use PHPStan\Rules\RuleErrorBuilder;
use PHPStan\Type\Constant\ConstantStringType;
use PHPStan\Type\MixedType;
use PHPStan\Type\ObjectType;
use PHPStan\Type\Type;
use PHPStan\Type\TypeCombinator;

/**
 * @implements Rule<Node>
 * @phpstan-type RouteCall StaticCall|MethodCall|NullsafeMethodCall
 * @phpstan-type Attributes array{values: array<string, Type>, unknown: bool}
 * @phpstan-type Group array{call: RouteCall, attributes: Attributes, callback: Expr|null}
 */
class RouteRules implements Rule
{
    private const ENDPOINTS = [
        'get', 'head', 'post', 'put', 'patch', 'delete', 'options', 'any', 'match', 'addroute', 'fallback',
        'redirect', 'permanentredirect', 'view', 'inertia', 'resource', 'apiresource', 'resources',
        'apiresources', 'softdeletableresources', 'singleton', 'apisingleton', 'singletons', 'apisingletons',
    ];

    private const ATTRIBUTES = [
        'as', 'name', 'prefix', 'middleware', 'controller', 'domain', 'namespace', 'where', 'can',
        'scopebindings', 'withoutscopedbindings', 'withoutmiddleware', 'missing', 'metadata',
    ];

    /** @var \WeakMap<Node, Node>|null */
    private ?\WeakMap $parents = null;

    /** @var \WeakMap<Node, bool>|null */
    private ?\WeakMap $processed = null;

    private ?string $file = null;

    public function getNodeType(): string
    {
        return Node::class;
    }

    /** @return list<RuleError> */
    public function processNode(Node $node, Scope $scope): array
    {
        if ($node instanceof FileNode) {
            // Keep only this file's original AST. Synthetic PHPStan nodes must
            // not produce a second diagnostic for the same registration.
            $this->file = $scope->getFile();
            $this->parents = new \WeakMap;
            $this->processed = new \WeakMap;

            if ($this->isRouteFile($scope)) {
                foreach ($node->getNodes() as $statement) {
                    $this->indexParents($statement, $node);
                }
            }

            return [];
        }

        if ($this->file !== $scope->getFile()
            || $this->parents === null || $this->processed === null
            || ! isset($this->parents[$node]) || isset($this->processed[$node])
            || ! $this->isCall($node) || $node->isFirstClassCallable()) {
            return [];
        }

        $method = $this->methodName($node, $scope);

        if ($method === null) {
            if ($this->receiverKind($node, $scope) === null) {
                return [];
            }

            $this->processed[$node] = true;

            return $this->enforceControllerAction($node, $scope);
        }

        if ($method !== 'group' && ! in_array($method, self::ENDPOINTS, true)) {
            return [];
        }

        if ($this->receiverKind($node, $scope) === null) {
            return [];
        }

        $this->processed[$node] = true;
        $groups = $this->enclosingGroups($node, $scope);
        $group = $method === 'group' ? $this->describeGroup($node, $scope) : null;

        return [
            ...($group === null ? $this->enforcePrefix($node, $groups) : []),
            ...($group !== null ? $this->enforceGroupName($group) : []),
            ...($group !== null ? $this->enforcePrefixNameMatch($group) : []),
            ...($group !== null ? $this->enforceGroupComment($group) : []),
            ...($group === null ? $this->enforceControllerAction($node, $scope) : []),
            ...($group === null ? $this->enforceRouteName($node, $scope) : []),
            ...$this->enforceTopLevelMiddlewareGroup($node, $group, $groups),
        ];
    }

    private function isRouteFile(Scope $scope): bool
    {
        $root = getcwd();

        return $root !== false && str_starts_with(
            str_replace('\\', '/', $scope->getFile()),
            rtrim(str_replace('\\', '/', $root), '/').'/routes/',
        );
    }

    private function indexParents(Node $node, Node $parent): void
    {
        $this->parents[$node] = $parent;

        foreach ($node->getSubNodeNames() as $name) {
            $children = $node->$name;

            foreach (is_array($children) ? $children : [$children] as $child) {
                if ($child instanceof Node) {
                    $this->indexParents($child, $node);
                }
            }
        }
    }

    /** @phpstan-assert-if-true RouteCall $node */
    private function isCall(Node $node): bool
    {
        return $node instanceof StaticCall || $node instanceof MethodCall || $node instanceof NullsafeMethodCall;
    }

    /** @param RouteCall $call */
    private function methodName(Expr $call, Scope $scope): ?string
    {
        if ($call->name instanceof Identifier) {
            return strtolower($call->name->toString());
        }

        $type = $scope->getType($call->name);

        return $type instanceof ConstantStringType ? strtolower($type->getValue()) : null;
    }

    /**
     * Classify the receiver, not the result: Route::get(...)->fallback()
     * modifies a Route and must not be mistaken for Router::fallback(...).
     *
     * @param RouteCall $call
     * @return 'router'|'registrar'|null
     */
    private function receiverKind(Expr $call, Scope $scope): ?string
    {
        $receiver = $call instanceof StaticCall ? $call->class : $call->var;

        if ($receiver instanceof Name) {
            $type = $scope->resolveTypeByName($receiver);
        } else {
            $type = $scope->getType($receiver);

            if ($call instanceof StaticCall) {
                $type = $type->getObjectTypeOrClassStringObjectType();
            }
        }

        $type = TypeCombinator::removeNull($type);

        if ((new ObjectType(RouteFacade::class))->isSuperTypeOf($type)->yes()
            || (new ObjectType(Router::class))->isSuperTypeOf($type)->yes()) {
            return 'router';
        }

        if ((new ObjectType(RouteRegistrar::class))->isSuperTypeOf($type)->yes()) {
            return 'registrar';
        }

        // Facade magic methods may have incomplete return types. Follow only
        // Laravel's known fluent operations from a proven routing receiver.
        if ($receiver instanceof Expr && $this->isCall($receiver)
            && ! $receiver->isFirstClassCallable()) {
            $kind = $this->receiverKind($receiver, $scope);
            $method = $this->methodName($receiver, $scope);

            if ($kind !== null && (in_array($method, self::ATTRIBUTES, true)
                || $method === 'attribute' || ($method !== null && str_starts_with($method, 'where'))
                || ($method === 'group' && $kind === 'registrar'))) {
                return 'registrar';
            }
        }

        return null;
    }

    /**
     * @param RouteCall $call
     * @return Group
     */
    private function describeGroup(Expr $call, Scope $scope): array
    {
        if ($this->receiverKind($call, $scope) === 'router') {
            $expression = $this->argument($call, 0, ['attributes']);
            $attributes = ['values' => [], 'unknown' => true];

            if ($expression !== null) {
                $type = $scope->getType($expression);
                $attributes['unknown'] = ! $type->isConstantArray()->yes();

                // Laravel's literal group attributes use "as". "name" is a
                // registrar method alias, not an alias inside this array.
                foreach (['prefix', 'as', 'middleware'] as $key) {
                    $offset = new ConstantStringType($key);
                    $presence = $type->hasOffsetValueType($offset);

                    if ($presence->yes()) {
                        $attributes['values'][$key] = $type->getOffsetValueType($offset);
                    } elseif ($presence->maybe()) {
                        $attributes['unknown'] = true;
                    }
                }
            }

            $callback = $this->argument($call, 1, ['routes']);
        } else {
            $attributes = $this->fluentAttributes($call, $scope);
            $callback = $this->argument($call, 0, ['callback']);
        }

        return ['call' => $call, 'attributes' => $attributes, 'callback' => $callback];
    }

    /**
     * Return attributes in effect BEFORE a registration. Registrar writes
     * overwrite earlier values; modifiers after group() cannot affect it.
     *
     * @param RouteCall $call
     * @return Attributes
     */
    private function fluentAttributes(Expr $call, Scope $scope): array
    {
        if ($call instanceof StaticCall || $this->receiverKind($call, $scope) === 'router') {
            return ['values' => [], 'unknown' => false];
        }

        $previous = $call->var;

        if (! $this->isCall($previous) || $previous->isFirstClassCallable()
            || $this->receiverKind($previous, $scope) === null) {
            // A registrar supplied by a variable/helper has unproven state.
            return ['values' => [], 'unknown' => true];
        }

        $attributes = $this->fluentAttributes($previous, $scope);
        $method = $this->methodName($previous, $scope);

        if ($method === null) {
            return ['values' => [], 'unknown' => true];
        }

        $key = $method === 'name' ? 'as' : $method;
        // Router/registrar magic attribute methods consume numeric argument
        // zero; unlike real methods they do not bind a named argument.
        $value = $this->argument($previous, 0, []);

        if ($method === 'attribute') {
            $keyExpression = $this->argument($previous, 0, ['key']);
            $keyType = $keyExpression !== null ? $scope->getType($keyExpression) : null;
            $key = $keyType instanceof ConstantStringType ? $keyType->getValue() : null;
            $key = $key === 'name' ? 'as' : $key;
            $value = $this->argument($previous, 1, ['value']);

            if ($key === null) {
                // An unknown write could replace any previously set value.
                $attributes['unknown'] = true;

                foreach ($attributes['values'] as $attribute => $type) {
                    $attributes['values'][$attribute] = new MixedType;
                }
            }
        }

        if (in_array($key, ['prefix', 'as', 'middleware'], true)) {
            $attributes['values'][$key] = $value !== null ? $scope->getType($value) : new MixedType;
        }

        return $attributes;
    }

    /**
     * Only a closure/arrow passed as the actual group callback establishes
     * routing context. Ordinary closures/functions reset that context.
     *
     * @return list<Group>
     */
    private function enclosingGroups(Node $node, Scope $scope): array
    {
        $groups = [];

        while (isset($this->parents[$node])) {
            $node = $this->parents[$node];

            if (! $node instanceof FunctionLike) {
                continue;
            }

            if ((! $node instanceof Closure && ! $node instanceof ArrowFunction)
                || ($outerScope = $scope->getParentScope()) === null) {
                break;
            }

            $callback = $node;
            $parent = $this->parents[$callback] ?? null;

            // Router::group also accepts a literal array of callbacks.
            while ($parent instanceof Node\ArrayItem || $parent instanceof Array_) {
                $callback = $parent;
                $parent = $this->parents[$parent] ?? null;
            }

            $call = $parent instanceof Arg ? ($this->parents[$parent] ?? null) : null;

            if (! $call instanceof Expr || ! $this->isCall($call) || $call->isFirstClassCallable()
                || $this->methodName($call, $outerScope) !== 'group'
                || $this->receiverKind($call, $outerScope) === null) {
                break;
            }

            $group = $this->describeGroup($call, $outerScope);

            if ($group['callback'] !== $callback) {
                break;
            }

            $groups[] = $group;
            $scope = $outerScope;
        }

        return $groups;
    }

    /**
     * @param RouteCall $call
     * @param list<string> $names
     */
    private function argument(Expr $call, int $position, array $names): ?Expr
    {
        $unpacked = false;

        foreach ($call->getArgs() as $index => $argument) {
            if ($argument->unpack) {
                $unpacked = true;

                continue;
            }

            if (($argument->name !== null && in_array($argument->name->toString(), $names, true))
                || ($argument->name === null && $index === $position && ! $unpacked)) {
                return $argument->value;
            }
        }

        return null;
    }

    /**
     * @param RouteCall $call
     * @param list<Group> $groups
     * @return list<RuleError>
     */
    private function enforcePrefix(Expr $call, array $groups): array
    {
        foreach ($groups as $group) {
            if (isset($group['attributes']['values']['prefix'])) {
                return [];
            }
        }

        return [$this->error($call, __FUNCTION__, 'Every HTTP endpoint must be inside a group with an explicit prefix, including an empty prefix for root URLs. A per-route prefix does not satisfy this requirement.')];
    }

    /**
     * @param Group $group
     * @return list<RuleError>
     */
    private function enforceGroupName(array $group): array
    {
        $attributes = $group['attributes'];

        if (! isset($attributes['values']['prefix']) || isset($attributes['values']['as'])) {
            return [];
        }

        return [$this->error($group['call'], __FUNCTION__, 'Every prefix group must explicitly declare its name using name() or the "as" group attribute.')];
    }

    /**
     * @param Group $group
     * @return list<RuleError>
     */
    private function enforcePrefixNameMatch(array $group): array
    {
        $attributes = $group['attributes'];
        $prefix = $attributes['values']['prefix'] ?? null;
        $name = $attributes['values']['as'] ?? null;

        if ($prefix !== null && $name === null) {
            // Missing names belong exclusively to enforceGroupName().
            return [];
        }

        if ($prefix === null) {
            if ($attributes['unknown']) {
                return [$this->error($group['call'], __FUNCTION__, 'Cannot determine the local prefix/name attributes of this group. Declare them explicitly with statically determinable values.')];
            }

            return [];
        }

        if (! $prefix instanceof ConstantStringType || ! $name instanceof ConstantStringType) {
            return [$this->error($group['call'], __FUNCTION__, 'Cannot determine whether this group name matches its local prefix. Use statically determinable string values.')];
        }

        $expected = $prefix->getValue() === '' ? '' : $prefix->getValue().'.';

        if ($name->getValue() === $expected) {
            return [];
        }

        return [$this->error($group['call'], __FUNCTION__, sprintf('The group name must be exactly %s for the local prefix %s.', var_export($expected, true), var_export($prefix->getValue(), true)))];
    }

    /**
     * @param Group $group
     * @return list<RuleError>
     */
    private function enforceGroupComment(array $group): array
    {
        $attributes = $group['attributes']['values'];

        if (! isset($attributes['prefix']) && ! isset($attributes['middleware'])) {
            return [];
        }

        $declaration = $group['call'];
        $comments = $declaration->getComments();

        while (isset($this->parents[$declaration]) && ! $declaration instanceof Node\Stmt) {
            $parent = $this->parents[$declaration];

            if ($parent instanceof FunctionLike || $parent instanceof Arg || $parent instanceof FileNode) {
                break;
            }

            $declaration = $parent;
            array_push($comments, ...$declaration->getComments());
        }

        foreach ($comments as $comment) {
            if ($comment->getEndLine() < $declaration->getStartLine()) {
                return [];
            }
        }

        return [$this->error($group['call'], __FUNCTION__, 'Every middleware or prefix group must have a leading comment above its declaration.')];
    }

    /**
     * @param RouteCall $call
     * @return list<RuleError>
     */
    private function enforceControllerAction(Expr $call, Scope $scope): array
    {
        $method = $this->methodName($call, $scope);

        if ($method === null) {
            return [$this->error($call, __FUNCTION__, 'Cannot determine what this dynamic routing call registers. Use a statically determinable routing method so its group and endpoint requirements can be checked.')];
        }

        $position = match ($method) {
            'get', 'head', 'post', 'put', 'patch', 'delete', 'options', 'any' => 1,
            'match', 'addroute' => 2,
            'fallback' => 0,
            default => null,
        };
        $action = $position !== null ? $this->argument($call, $position, ['action']) : null;

        if ($action instanceof Array_ && count($action->items) === 2) {
            [$controller, $methodName] = $action->items;

            if ($controller !== null && $methodName !== null
                && ! $controller->unpack && ! $methodName->unpack && ! $controller->byRef && ! $methodName->byRef
                && ($controller->key === null || ($controller->key instanceof Int_ && $controller->key->value === 0))
                && ($methodName->key === null || ($methodName->key instanceof Int_ && $methodName->key->value === 1))
                && $controller->value instanceof ClassConstFetch && $controller->value->class instanceof Name
                && ! in_array(strtolower($controller->value->class->toString()), ['self', 'static', 'parent'], true)
                && $controller->value->name instanceof Identifier
                && strtolower($controller->value->name->toString()) === 'class'
                && $methodName->value instanceof String_ && $methodName->value->value !== '') {
                return [];
            }
        }

        return [$this->error($call, __FUNCTION__, "Every HTTP endpoint action must be a literal [SomeController::class, 'methodName'] pair with an explicit class and nonempty method. Replace shorthand and shortcut registrations with explicit controller routes.")];
    }

    /**
     * @param RouteCall $call
     * @return list<RuleError>
     */
    private function enforceRouteName(Expr $call, Scope $scope): array
    {
        $name = $this->fluentAttributes($call, $scope)['values']['as'] ?? null;
        $cursor = $call;

        // Inspect only the receiver spine of this registration's chain. Names
        // inside arguments, callbacks or another route can never satisfy it.
        while (isset($this->parents[$cursor])) {
            $parent = $this->parents[$cursor];

            if ((! $parent instanceof MethodCall && ! $parent instanceof NullsafeMethodCall)
                || $parent->var !== $cursor || $parent->isFirstClassCallable()) {
                break;
            }

            $method = $this->methodName($parent, $scope);

            if (! in_array($method, [
                'name', 'middleware', 'withoutmiddleware', 'prefix', 'domain', 'where', 'wherenumber',
                'wherealpha', 'wherealphanumeric', 'whereuuid', 'whereulid', 'wherein', 'setwheres',
                'defaults', 'setdefaults', 'fallback', 'setfallback', 'withtrashed', 'scopebindings',
                'withoutscopedbindings', 'can', 'missing', 'block', 'withoutblocking', 'metadata',
                'setmetadata', 'seturi', 'setbindingfields', 'setrouter', 'setcontainer',
            ], true)) {
                // A different object cannot lend its name to this route.
                break;
            }

            if ($method === 'name') {
                $expression = $this->argument($parent, 0, ['name']);
                $part = $expression !== null ? $scope->getType($expression) : new MixedType;

                // Route::name appends; a later empty suffix does not erase a
                // previously explicit nonempty name (registrars overwrite).
                if ($name instanceof ConstantStringType && $part instanceof ConstantStringType) {
                    $name = new ConstantStringType($name->getValue().$part->getValue());
                } elseif ($name === null || ! $name->isNonEmptyString()->yes()) {
                    $name = $part;
                }
            }

            $cursor = $parent;
        }

        if ($name !== null && $name->isNonEmptyString()->yes()) {
            return [];
        }

        return [$this->error($call, __FUNCTION__, 'Every HTTP endpoint must explicitly declare a statically provable nonempty route name in its registration chain. An inherited group name is insufficient.')];
    }

    /**
     * @param RouteCall $call
     * @param Group|null $group
     * @param list<Group> $groups
     * @return list<RuleError>
     */
    private function enforceTopLevelMiddlewareGroup(Expr $call, ?array $group, array $groups): array
    {
        if ($groups !== [] || ($group !== null && isset($group['attributes']['values']['middleware']))) {
            return [];
        }

        return [$this->error($call, __FUNCTION__, 'Outermost route declarations must be middleware groups. Place endpoint registrations in prefix groups inside a middleware group.')];
    }

    private function error(Node $node, string $method, string $message): RuleError
    {
        return RuleErrorBuilder::message($message)
            ->identifier('strata.route.'.$method)
            ->line($node->getStartLine())
            ->build();
    }
}
