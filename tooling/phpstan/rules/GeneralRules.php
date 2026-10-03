<?php

namespace Strata\PHPStan;

use Illuminate\Contracts\Auth\Factory as AuthFactory;
use Illuminate\Contracts\Auth\Guard;
use Illuminate\Database\Eloquent\Attributes\Scope as LocalScope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request as RequestFacade;
use PhpParser\Node;
use PhpParser\Node\Expr\ArrowFunction;
use PhpParser\Node\Expr\MethodCall;
use PhpParser\Node\Expr\NullsafeMethodCall;
use PhpParser\Node\Expr\StaticCall;
use PhpParser\Node\Identifier;
use PhpParser\Node\Name;
use PhpParser\NodeFinder;
use PHPStan\Analyser\Scope;
use PHPStan\Parser\Parser;
use PHPStan\Reflection\MethodReflection;
use PHPStan\Rules\Rule;
use PHPStan\Rules\RuleError;
use PHPStan\Rules\RuleErrorBuilder;
use PHPStan\Type\Constant\ConstantStringType;
use PHPStan\Type\NeverType;
use PHPStan\Type\ObjectType;
use PHPStan\Type\TypeCombinator;

/** @implements Rule<Node> */
class GeneralRules implements Rule
{
    /** @var array<string, array<int, string>> */
    private array $authenticatedUserAssignments = [];

    public function __construct(private readonly Parser $parser) {}

    public function getNodeType(): string
    {
        return Node::class;
    }

    /** @return list<RuleError> */
    public function processNode(Node $node, Scope $scope): array
    {
        return [
            ...$this->noEloquentQueriesOutsideServices($node, $scope),
            ...$this->noArrowFunctions($node),
            ...$this->requireAuthenticatedUserVariables($node, $scope),
            ...$this->requireNamedVariablesInReturnedArrays($node, $scope),
        ];
    }

    /** @return list<RuleError> */
    private function noEloquentQueriesOutsideServices(Node $node, Scope $scope): array
    {
        if ((! $node instanceof StaticCall && ! $node instanceof MethodCall && ! $node instanceof NullsafeMethodCall) || ! $node->name instanceof Identifier) {
            return [];
        }

        // PHPStan also visits a synthetic MethodCall for each nullsafe call.
        if ($node->getAttribute('virtualNullsafeMethodCall', false) || $node->isFirstClassCallable()) {
            return [];
        }

        $namespace = $scope->getNamespace() ?? '';

        if ($namespace === 'App\\Services' || str_starts_with($namespace, 'App\\Services\\')) {
            return [];
        }

        $receiver = $node instanceof StaticCall ? $node->class : $node->var;
        $receiverType = $receiver instanceof Name ? $scope->resolveTypeByName($receiver) : $scope->getType($receiver);

        if ($node instanceof StaticCall) {
            $receiverType = $receiverType->getObjectTypeOrClassStringObjectType();
        }

        $receiverType = TypeCombinator::removeNull($receiverType);
        $eloquentType = TypeCombinator::union(new ObjectType(Model::class), new ObjectType(Builder::class), new ObjectType(Relation::class));

        if (! $eloquentType->isSuperTypeOf($receiverType)->yes()) {
            return [];
        }

        $queryType = TypeCombinator::union(new ObjectType(Builder::class), new ObjectType(Relation::class), new ObjectType(QueryBuilder::class));
        $constructsQuery = $queryType->isSuperTypeOf(TypeCombinator::removeNull($scope->getType($node)))->yes();
        $retrievesData = false;
        $methodName = $node->name->toString();

        // Terminal reads can return models, collections, paginators, scalars,
        // or callback results, so their return types alone cannot identify them.
        if (in_array(strtolower($methodName), [
            'all', 'get', 'getmodels', 'getresults', 'fromquery',
            'find', 'findmany', 'findsole', 'findorfail', 'findor',
            'first', 'firstorfail', 'firstor', 'sole',
            'value', 'valueorfail', 'solevalue', 'rawvalue', 'pluck', 'modelkeys', 'implode',
            'paginate', 'simplepaginate', 'cursorpaginate', 'cursor',
            'chunk', 'chunkmap', 'chunkbyid', 'chunkbyiddesc', 'orderedchunkbyid', 'each', 'eachbyid',
            'lazy', 'lazybyid', 'lazybyiddesc',
            'aggregate', 'numericaggregate', 'count', 'getcountforpagination', 'sum', 'min', 'max', 'avg', 'average',
            'exists', 'existsor', 'doesntexist', 'doesntexistor',
            'fresh', 'refresh', 'refreshforupdate', 'load', 'loadmissing', 'loadmorph',
            'loadaggregate', 'loadcount', 'loadmin', 'loadmax', 'loadsum', 'loadavg', 'loadexists',
            'loadmorphaggregate', 'loadmorphcount', 'loadmorphmin', 'loadmorphmax', 'loadmorphsum', 'loadmorphavg',
        ], true) && $receiverType->hasMethod($methodName)->yes()) {
            $method = $receiverType->getMethod($methodName, $scope);

            // A custom model helper with the same name is not necessarily a query.
            $retrievesData = str_starts_with($method->getDeclaringClass()->getName(), 'Illuminate\\Database\\')
                || str_starts_with($method->getPrototype()->getDeclaringClass()->getName(), 'Illuminate\\Database\\');
        }

        if (! $retrievesData && (! $constructsQuery || $this->isModelQueryDefinition($scope))) {
            return [];
        }

        return [
            RuleErrorBuilder::message("Eloquent queries must run in App\\Services. Move this {$methodName}() call into a service and call that service using an ID, UID, slug, or equivalent identifier. Model relationship and local-scope definitions may construct queries, but must not retrieve data.")
                ->identifier('strata.general.noEloquentQueriesOutsideServices')
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function noArrowFunctions(Node $node): array
    {
        if (! $node instanceof ArrowFunction) {
            return [];
        }

        return [
            RuleErrorBuilder::message('Use an anonymous function with an explicit return statement. Capture any required outer variables using use (...).')
                ->identifier('strata.general.noArrowFunctions')
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function requireAuthenticatedUserVariables(Node $node, Scope $scope): array
    {
        if ((! $node instanceof StaticCall && ! $node instanceof MethodCall && ! $node instanceof NullsafeMethodCall)
            || $node->getAttribute('virtualNullsafeMethodCall', false)
            || $node->isFirstClassCallable()) {
            return [];
        }

        if ($node->name instanceof Identifier) {
            $methodName = strtolower($node->name->toString());
        } else {
            $names = $scope->getType($node->name)->getConstantStrings();
            $methodName = count($names) === 1 ? strtolower($names[0]->getValue()) : '';
        }

        if ($methodName !== 'user' && $methodName !== 'id') {
            return [];
        }

        $receiver = $node instanceof StaticCall ? $node->class : $node->var;
        $receiverType = $receiver instanceof Name ? $scope->resolveTypeByName($receiver) : $scope->getType($receiver);

        if ($node instanceof StaticCall) {
            $receiverType = $receiverType->getObjectTypeOrClassStringObjectType();
        }

        $authenticationTypes = [new ObjectType(Auth::class), new ObjectType(AuthFactory::class), new ObjectType(Guard::class)];

        if ($methodName === 'user') {
            $authenticationTypes[] = new ObjectType(Request::class);
            $authenticationTypes[] = new ObjectType(RequestFacade::class);
        }

        if (! TypeCombinator::union(...$authenticationTypes)->isSuperTypeOf(TypeCombinator::removeNull($receiverType))->yes()) {
            return [];
        }

        $variableName = $methodName === 'user' ? 'user' : 'userId';
        // A trait's source positions belong to the trait file, not its consuming class.
        $file = $scope->getTraitReflection()?->getFileName() ?: $scope->getFile();

        if (! isset($this->authenticatedUserAssignments[$file])) {
            $this->authenticatedUserAssignments[$file] = $this->findAuthenticatedUserAssignments($file);
        }

        if (($this->authenticatedUserAssignments[$file][$node->getStartFilePos()] ?? null) === $variableName) {
            return [];
        }

        $value = $methodName === 'user' ? 'authenticated user' : 'authenticated user ID';

        return [
            RuleErrorBuilder::message("Assign the {$value} to \${$variableName} in a separate statement before using it.")
                ->identifier('strata.general.requireAuthenticatedUserVariables')
                ->line($node->getStartLine())
                ->build(),
        ];
    }

    /** @return array<int, string> */
    private function findAuthenticatedUserAssignments(string $file): array
    {
        $assignments = [];

        // Index source statements once; call-site scopes still determine whether
        // each receiver is Laravel authentication or an unrelated user()/id() method.
        foreach ((new NodeFinder)->findInstanceOf($this->parser->parseFile($file), Node\Stmt\Expression::class) as $statement) {
            $assignment = $statement->expr;

            if ((! $assignment instanceof Node\Expr\Assign && ! $assignment instanceof Node\Expr\AssignRef)
                || ! $assignment->var instanceof Node\Expr\Variable
                || ! is_string($assignment->var->name)) {
                continue;
            }

            $expression = $assignment->expr;

            // ID casts may accompany the assignment without allowing inline retrieval.
            if ($assignment->var->name === 'userId') {
                while ($expression instanceof Node\Expr\Cast\Int_ || $expression instanceof Node\Expr\Cast\String_) {
                    $expression = $expression->expr;
                }
            }

            if (($expression instanceof StaticCall || $expression instanceof MethodCall || $expression instanceof NullsafeMethodCall)
                && $expression->getStartFilePos() >= 0) {
                $assignments[$expression->getStartFilePos()] = $assignment->var->name;
            }
        }

        return $assignments;
    }

    /** @return list<RuleError> */
    private function requireNamedVariablesInReturnedArrays(Node $node, Scope $scope): array
    {
        if (! $node instanceof Node\Stmt\Return_ || ! $node->expr instanceof Node\Expr\Array_) {
            return [];
        }

        $errors = [];

        foreach ($node->expr->items as $item) {
            if ($item === null || $item->unpack || $item->key === null) {
                continue;
            }

            $keyType = $scope->getType($item->key);
            $keyName = $keyType instanceof ConstantStringType ? $keyType->getValue() : null;
            // Numeric, dynamic, and non-identifier keys still require a variable,
            // but cannot prescribe a matching PHP variable name.
            $variableName = $keyName !== null && preg_match('/^[a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*$/D', $keyName) === 1 ? $keyName : null;

            if ($item->value instanceof Node\Expr\Variable
                && is_string($item->value->name)
                && ($variableName === null || $item->value->name === $variableName)) {
                continue;
            }

            $message = $variableName !== null
                ? "Returned array key \"{$keyName}\" must use the matching local variable \${$variableName}. Assign or rename the value to \${$variableName} before returning the array."
                : 'Explicitly keyed values in returned arrays must be plain named variables. Assign this value to a variable before returning the array.';

            $errors[] = RuleErrorBuilder::message($message)
                ->identifier('strata.general.requireNamedVariablesInReturnedArrays')
                ->line($item->value->getStartLine())
                ->build();
        }

        return $errors;
    }

    private function isModelQueryDefinition(Scope $scope): bool
    {
        $class = $scope->getClassReflection();
        // PHPStan retains the enclosing method here inside closures and arrow
        // functions, including query callbacks in relationship and scope bodies.
        $method = $scope->getFunction();

        if ($class === null || ! $class->is(Model::class) || ! $method instanceof MethodReflection) {
            return false;
        }

        if (preg_match('/^scope[A-Z]/', $method->getName()) === 1) {
            return true;
        }

        if (! $method->isPrivate()) {
            foreach ($method->getAttributes() as $attribute) {
                if ($attribute->getName() === LocalScope::class) {
                    return true;
                }
            }
        }

        $relationType = new ObjectType(Relation::class);

        foreach ([$method->getReturnType(), $method->getNativeReturnType()] as $returnType) {
            // Never is a subtype of every type, but cannot define a relationship.
            if (! ($returnType instanceof NeverType) && $relationType->isSuperTypeOf($returnType)->yes()) {
                return true;
            }
        }

        return false;
    }
}
