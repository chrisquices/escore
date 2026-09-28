<?php

namespace Shared\Quality\PHPStan;

use PhpParser\Node;
use PhpParser\Node\Expr;
use PHPStan\Analyser\Scope;
use PHPStan\Rules\RuleError;
use PHPStan\Rules\RuleErrorBuilder;

final class Shared
{
    public static function error(Node $node, string $message, string $identifier): RuleError
    {
        $parts = explode('\\', $identifier);
        $identifier = str_replace('::', '.', $parts[count($parts) - 1]);

        return RuleErrorBuilder::message($message)
            ->identifier($identifier)
            ->line($node->getStartLine())
            ->build();
    }

    /** @phpstan-assert-if-true Expr\StaticCall $expression */
    public static function isNumberHelperFormatter(Expr $expression, Scope $scope): bool
    {
        return $expression instanceof Expr\StaticCall
            && ! $expression->isFirstClassCallable()
            && $expression->class instanceof Node\Name
            && strcasecmp($scope->resolveName($expression->class), 'App\\Helpers\\NumberHelper') === 0
            && $expression->name instanceof Node\Identifier
            && in_array(strtolower($expression->name->toString()), [
                'formatnumberwithseparators',
                'formatnumbertocurrency',
                'formatnumbertopercentage',
            ], true);
    }

    public static function getCallArgument(Expr\CallLike $call, string $name, int $position): ?Expr
    {
        foreach ($call->getArgs() as $index => $argument) {
            if ($argument->unpack) {
                return null;
            }

            if ($argument->name !== null
                ? $argument->name->toString() === $name
                : $index === $position) {
                return $argument->value;
            }
        }

        return null;
    }
}
