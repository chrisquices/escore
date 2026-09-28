<?php

namespace Shared\Quality\PHPStan;

use PhpParser\Node;
use PHPStan\Analyser\Scope;
use PHPStan\Rules\Rule;

class NumberHelperRules implements Rule
{
    public function getNodeType(): string
    {
        return Node::class;
    }

    public function processNode(Node $node, Scope $scope): array
    {
        $errors = [
            ...$this->requireOriginalAndFormattedVariablesToHaveMatchingNames($node, $scope),
        ];

        return $errors;
    }

    private function requireOriginalAndFormattedVariablesToHaveMatchingNames(Node $node, Scope $scope): array
    {
        if (! $node instanceof Node\Expr\Assign
            || ! $node->var instanceof Node\Expr\Variable
            || ! is_string($node->var->name)) {
            return [];
        }

        $expressions = [$node->expr];

        while ($expressions !== []) {
            $expression = array_pop($expressions);

            if ($expression instanceof Node\Expr\Ternary) {
                $expressions[] = $expression->if ?? $expression->cond;
                $expressions[] = $expression->else;

                continue;
            }

            if ($expression instanceof Node\Expr\BinaryOp\Coalesce) {
                $expressions[] = $expression->left;
                $expressions[] = $expression->right;

                continue;
            }

            if ($expression instanceof Node\Expr\Match_) {
                foreach ($expression->arms as $arm) {
                    $expressions[] = $arm->body;
                }

                continue;
            }

            if ($expression instanceof Node\Expr\Assign) {
                $expressions[] = $expression->expr;

                continue;
            }

            if (! Shared::isNumberHelperFormatter($expression, $scope)) {
                continue;
            }

            $original = Shared::getCallArgument($expression, 'number', 0);

            if (! $original instanceof Node\Expr\Variable
                || ! is_string($original->name)) {
                continue;
            }

            $expectedName = $original->name.'Formatted';

            if ($node->var->name === $expectedName) {
                continue;
            }

            $errors = [
                Shared::error($node->var, "Name this variable \${$expectedName} because it formats \${$original->name}.", __METHOD__),
            ];

            return $errors;
        }

        return [];
    }
}
