<?php

namespace Shared\Quality\PHPStan;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use PhpParser\Node;
use PhpParser\Node\Expr\MethodCall;
use PhpParser\Node\Expr\StaticCall;
use PhpParser\Node\Identifier;
use PhpParser\Node\Name;
use PHPStan\Analyser\Scope;
use PHPStan\Rules\Rule;
use PHPStan\Type\ObjectType;

/** @implements Rule<MethodCall> */
class EloquentRules implements Rule
{
    public function getNodeType(): string
    {
        return MethodCall::class;
    }

    public function processNode(Node $node, Scope $scope): array
    {
        $errors = [
            ...$this->requireQueryOnLongChains($node, $scope),
        ];

        return $errors;
    }

    private function requireQueryOnLongChains(MethodCall $node, Scope $scope): array
    {
        $root = $node;
        $callCount = 1;

        while ($root instanceof MethodCall) {
            $callCount++;
            $root = $root->var;
        }

        if (! $root instanceof StaticCall || ! $root->class instanceof Name || ! $root->name instanceof Identifier) {
            return [];
        }

        if (strtolower($root->name->toString()) === 'query') {
            return [];
        }

        // Report at the third call to avoid duplicate errors on longer chains.
        if ($callCount !== 3) {
            return [];
        }

        $modelType = new ObjectType(Model::class);
        $classType = new ObjectType($scope->resolveName($root->class));

        if (! $modelType->isSuperTypeOf($classType)->yes()) {
            return [];
        }

        $builderType = new ObjectType(Builder::class);
        $queryBuilderType = new ObjectType(\Illuminate\Database\Query\Builder::class);
        $receiverType = $scope->getType($node->var);

        if (
            ! $builderType->isSuperTypeOf($receiverType)->yes()
            && ! $queryBuilderType->isSuperTypeOf($receiverType)->yes()
        ) {
            return [];
        }

        $errors = [
            Shared::error($root, 'Eloquent queries with three or more calls must begin with query().', __METHOD__),
        ];

        return $errors;
    }
}
