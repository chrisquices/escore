<?php

namespace Strata\PHPStan;

use Illuminate\Database\Eloquent\Model;
use PhpParser\Node;
use PhpParser\Node\Expr\Variable;
use PhpParser\Node\IntersectionType;
use PhpParser\Node\Name;
use PhpParser\Node\NullableType;
use PhpParser\Node\Stmt\ClassMethod;
use PhpParser\Node\UnionType;
use PHPStan\Analyser\Scope;
use PHPStan\Rules\Rule;
use PHPStan\Rules\RuleError;
use PHPStan\Rules\RuleErrorBuilder;
use PHPStan\Type\ObjectType;

/** @implements Rule<ClassMethod> */
class ServiceRules implements Rule
{
    public function getNodeType(): string
    {
        return ClassMethod::class;
    }

    /** @return list<RuleError> */
    public function processNode(Node $node, Scope $scope): array
    {
        $namespace = $scope->getNamespace() ?? '';

        if ($namespace !== 'App\\Services' && ! str_starts_with($namespace, 'App\\Services\\')) {
            return [];
        }

        return $this->noModelUsageInMethodParameters($node, $scope);
    }

    /** @return list<RuleError> */
    private function noModelUsageInMethodParameters(ClassMethod $node, Scope $scope): array
    {
        $errors = [];
        $modelType = new ObjectType(Model::class);

        foreach ($node->params as $parameter) {
            if ($parameter->type === null || ! $parameter->var instanceof Variable || ! is_string($parameter->var->name)) {
                continue;
            }

            // Inspect explicit native components without including PHPDoc types.
            $types = [$parameter->type];

            while ($types !== []) {
                $type = array_pop($types);

                if ($type instanceof NullableType) {
                    $types[] = $type->type;
                } elseif ($type instanceof UnionType || $type instanceof IntersectionType) {
                    array_push($types, ...$type->types);
                } elseif ($type instanceof Name && $modelType->isSuperTypeOf($scope->resolveTypeByName($type))->yes()) {
                    $errors[] = RuleErrorBuilder::message("Service method parameter \${$parameter->var->name} must receive an ID, UID, slug, or equivalent identifier. Look up the Eloquent model inside the service.")
                        ->identifier('strata.service.noModelUsageInMethodParameters')
                        ->line($parameter->getStartLine())
                        ->build();

                    break;
                }
            }
        }

        return $errors;
    }
}
