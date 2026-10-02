<?php

namespace Strata\PHPStan;

use Illuminate\Database\Eloquent\Attributes\Scope as LocalScope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\Query\Builder as QueryBuilder;
use PhpParser\Node;
use PhpParser\Node\Expr\ArrowFunction;
use PhpParser\Node\Expr\MethodCall;
use PhpParser\Node\Expr\NullsafeMethodCall;
use PhpParser\Node\Expr\StaticCall;
use PhpParser\Node\Identifier;
use PhpParser\Node\Name;
use PHPStan\Analyser\Scope;
use PHPStan\Reflection\MethodReflection;
use PHPStan\Rules\Rule;
use PHPStan\Rules\RuleError;
use PHPStan\Rules\RuleErrorBuilder;
use PHPStan\Type\NeverType;
use PHPStan\Type\ObjectType;
use PHPStan\Type\TypeCombinator;

/** @implements Rule<Node> */
class GeneralRules implements Rule
{
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
