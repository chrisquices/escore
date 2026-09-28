<?php

namespace Shared\Quality\PHPStan;

use Illuminate\Http\Resources\Json\JsonResource;
use PhpParser\Node;
use PhpParser\Node\Expr;
use PhpParser\Node\Expr\PropertyFetch;
use PhpParser\Node\Identifier;
use PhpParser\Node\Stmt\ClassMethod;
use PHPStan\Analyser\Scope;
use PHPStan\Rules\Rule;

/** @implements Rule<Node> */
class ResourceRules implements Rule
{
    public function getNodeType(): string
    {
        return Node::class;
    }

    public function processNode(Node $node, Scope $scope): array
    {
        if (! $scope->getClassReflection()?->is(JsonResource::class)) {
            return [];
        }

        // PHPStan also visits synthetic copies of nullsafe calls and property reads.
        if ($node->getAttribute('virtualNullsafeMethodCall', false) || $node->getAttribute('virtualNullsafePropertyFetch', false)) {
            return [];
        }

        $errors = [
            ...$this->requireInitialResourceAssignment($node),
            ...$this->rejectMathOperations($node, $scope),
        ];

        return $errors;
    }

    private function requireInitialResourceAssignment(Node $node): array
    {
        if (! $node instanceof ClassMethod || strtolower($node->name->toString()) !== 'toarray' || $node->stmts === null) {
            return [];
        }

        $statement = $node->stmts[0] ?? null;
        $assignment = $statement instanceof Node\Stmt\Expression ? $statement->expr : null;

        if ($assignment instanceof Expr\Assign
            && $assignment->var instanceof Expr\Variable
            && is_string($assignment->var->name)
            && $assignment->var->name !== 'this'
            && $assignment->expr instanceof PropertyFetch
            && $assignment->expr->var instanceof Expr\Variable
            && $assignment->expr->var->name === 'this'
            && $assignment->expr->name instanceof Identifier
            && $assignment->expr->name->toString() === 'resource') {
            return [];
        }

        $errors = [
            Shared::error($statement ?? $node, 'Resource toArray() must begin by assigning $this->resource to a local variable.', __METHOD__),
        ];

        return $errors;
    }

    private function rejectMathOperations(Node $node, Scope $scope): array
    {
        $operations = [
            Expr\BinaryOp\Plus::class, Expr\BinaryOp\Minus::class, Expr\BinaryOp\Mul::class,
            Expr\BinaryOp\Div::class, Expr\BinaryOp\Mod::class, Expr\BinaryOp\Pow::class,
            Expr\AssignOp\Plus::class, Expr\AssignOp\Minus::class, Expr\AssignOp\Mul::class,
            Expr\AssignOp\Div::class, Expr\AssignOp\Mod::class, Expr\AssignOp\Pow::class,
            Expr\PreInc::class, Expr\PostInc::class, Expr\PreDec::class, Expr\PostDec::class,
            Expr\UnaryMinus::class, Expr\UnaryPlus::class,
        ];

        if (! in_array($node::class, $operations, true)) {
            return [];
        }

        // Signed numeric literals are values, not calculations.
        if (($node instanceof Expr\UnaryMinus || $node instanceof Expr\UnaryPlus)
            && ($node->expr instanceof Node\Scalar\Int_ || $node->expr instanceof Node\Scalar\Float_)) {
            return [];
        }

        // Both + and += support array union.
        if ($node instanceof Expr\BinaryOp\Plus || $node instanceof Expr\AssignOp\Plus) {
            $left = $node instanceof Expr\BinaryOp\Plus ? $node->left : $node->var;
            $right = $node instanceof Expr\BinaryOp\Plus ? $node->right : $node->expr;

            if ($scope->getType($left)->isArray()->yes()
                && $scope->getType($right)->isArray()->yes()) {
                return [];
            }
        }

        $errors = [
            Shared::error($node, 'Resources must not perform arithmetic. Calculate values before creating the resource.', __METHOD__),
        ];

        return $errors;
    }
}
