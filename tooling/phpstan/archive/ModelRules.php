<?php

namespace Shared\Quality\PHPStan;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Notifications\Notifiable;
use PhpParser\Node;
use PhpParser\Node\Stmt\ClassMethod;
use PhpParser\Node\Stmt\Property;
use PHPStan\Analyser\Scope;
use PHPStan\Node\InClassNode;
use PHPStan\Reflection\ClassReflection;
use PHPStan\Rules\Rule;
use PHPStan\Type\Constant\ConstantArrayType;
use PHPStan\Type\Constant\ConstantIntegerType;
use PHPStan\Type\Constant\ConstantStringType;
use PHPStan\Type\ObjectType;

/** @implements Rule<InClassNode> */
class ModelRules implements Rule
{
    public function getNodeType(): string
    {
        return InClassNode::class;
    }

    public function processNode(Node $node, Scope $scope): array
    {
        $class = $node->getClassReflection();

        if (! $class->is(Model::class)) {
            return [];
        }

        $errors = [
            ...$this->requireMembers($node, $scope),
            ...$this->requireMemberOrder($node, $class),

            ...$this->requirePropertyTable($node, $scope),
            ...$this->requirePropertyGuarded($node, $scope),
            ...$this->requirePropertyFillable($node, $scope),
            ...$this->requirePropertyHidden($node, $scope),
            ...$this->requirePropertyCasts($node, $scope),

            ...$this->rejectOverlapBetweenGuardedAndFillable($node, $scope),

        ];

        return $errors;
    }

    // Members
    private function requireMembers(InClassNode $node, Scope $scope): array
    {
        $registeredMembers = [
            'property' => ['table', 'guarded', 'fillable', 'hidden', 'casts'],
            'method' => [],
            'constant' => [],
            'trait' => [Notifiable::class],
        ];

        $class = $node->getClassReflection();
        $relationType = new ObjectType(Relation::class);
        $members = [];
        $errors = [];

        foreach ($node->getOriginalNode()->stmts as $statement) {
            if ($statement instanceof Property) {
                foreach ($statement->props as $property) {
                    $members[] = ['property', $property->name->toString(), $property];
                }
            } elseif ($statement instanceof ClassMethod) {
                $name = strtolower($statement->name->toString());
                $isRelationship = false;

                if ($name !== 'casts' && $class->hasNativeMethod($name)) {
                    foreach ($class->getNativeMethod($name)->getVariants() as $variant) {
                        if ($relationType->isSuperTypeOf($variant->getReturnType())->yes()) {
                            $isRelationship = true;
                            break;
                        }
                    }
                }

                if (! $isRelationship) {
                    $members[] = ['method', $name, $statement];
                }

                if ($name === '__construct') {
                    foreach ($statement->params as $parameter) {
                        if ($parameter->flags === 0 || ! $parameter->var instanceof Node\Expr\Variable || ! is_string($parameter->var->name)) {
                            continue;
                        }

                        $members[] = ['property', $parameter->var->name, $parameter];
                    }
                }
            } elseif ($statement instanceof Node\Stmt\ClassConst) {
                foreach ($statement->consts as $constant) {
                    $members[] = ['constant', $constant->name->toString(), $constant];
                }
            } elseif ($statement instanceof Node\Stmt\TraitUse) {
                foreach ($statement->traits as $trait) {
                    $members[] = ['trait', $scope->resolveName($trait), $trait];
                }
            }
        }

        foreach ($members as [$kind, $name, $member]) {
            if (in_array($name, $registeredMembers[$kind], true)) {
                continue;
            }

            $label = match ($kind) {
                'property' => '$'.$name,
                'method' => $name.'()',
                default => $name,
            };

            $errors[] = Shared::error($member, "{$label} has no model rule defined. Add a dedicated rule before using this {$kind}.", __METHOD__);
        }

        return $errors;
    }

    private function requireMemberOrder(InClassNode $node, ClassReflection $class): array
    {
        $propertyOrder = [
            'table' => 1,
            'guarded' => 2,
            'fillable' => 3,
            'hidden' => 4,
            'casts' => 5,
        ];

        $relationType = new ObjectType(Relation::class);
        $errors = [];
        $lastOrder = 0;

        foreach ($node->getOriginalNode()->stmts as $statement) {
            $members = [];

            if ($statement instanceof Property) {
                foreach ($statement->props as $property) {
                    $name = $property->name->toString();

                    if (isset($propertyOrder[$name])) {
                        $members[] = [$propertyOrder[$name], '$'.$name];
                    }
                }
            } elseif ($statement instanceof ClassMethod) {
                $name = $statement->name->toString();

                if (! $class->hasNativeMethod($name)) {
                    continue;
                }

                foreach ($class->getNativeMethod($name)->getVariants() as $variant) {
                    if ($relationType->isSuperTypeOf($variant->getReturnType())->yes()) {
                        $members[] = [6, $name.'()'];
                        break;
                    }
                }
            }

            foreach ($members as [$order, $name]) {
                if ($order < $lastOrder) {
                    $errors[] = Shared::error($statement, "{$name} is out of order. Expected: \$table, \$guarded, \$fillable, \$hidden, \$casts, relationships.", __METHOD__);

                    continue;
                }

                $lastOrder = $order;
            }
        }

        return $errors;
    }

    // Properties
    private function getProperty(InClassNode $node, string $name): ?Property
    {
        foreach ($node->getOriginalNode()->stmts as $statement) {
            if (! $statement instanceof Property) {
                continue;
            }

            foreach ($statement->props as $property) {
                if ($property->name->toString() === $name) {
                    return $statement;
                }
            }
        }

        return null;
    }

    private function getPropertyValue(Property $property, string $name): ?Node\Expr
    {
        foreach ($property->props as $declared) {
            if ($declared->name->toString() === $name) {
                return $declared->default;
            }
        }

        return null;
    }

    private function requirePropertyTable(InClassNode $node, Scope $scope): array
    {
        $property = $this->getProperty($node, 'table');

        if ($property?->isStatic()) {
            $errors = [Shared::error($property, '$table must not be static.', __METHOD__)];

            return $errors;
        }

        if ($property?->isProtected()) {
            $default = $this->getPropertyValue($property, 'table');

            if ($default === null || ! $scope->getType($default)->isNonEmptyString()->yes()) {
                $errors = [Shared::error($property, '$table must default to a nonempty string.', __METHOD__)];

                return $errors;
            }

            return [];
        }

        $message = $property ? '$table must be protected.' : 'Model must explicitly declare protected $table.';

        $errors = [Shared::error($property ?? $node, $message, __METHOD__)];

        return $errors;
    }

    private function requirePropertyGuarded(InClassNode $node, Scope $scope): array
    {
        $property = $this->getProperty($node, 'guarded');

        if ($property?->isStatic()) {
            $errors = [Shared::error($property, '$guarded must not be static.', __METHOD__)];

            return $errors;
        }

        if ($property?->isProtected()) {
            $default = $this->getPropertyValue($property, 'guarded');
            $expected = new ConstantArrayType([new ConstantIntegerType(0)], [new ConstantStringType('id')]);

            if ($default === null || ! $expected->equals($scope->getType($default))) {
                $errors = [Shared::error($property, "\$guarded must default to ['id'].", __METHOD__)];

                return $errors;
            }

            return [];
        }

        $message = $property ? '$guarded must be protected.' : 'Model must explicitly declare protected $guarded.';

        $errors = [Shared::error($property ?? $node, $message, __METHOD__)];

        return $errors;
    }

    private function requirePropertyFillable(InClassNode $node, Scope $scope): array
    {
        $property = $this->getProperty($node, 'fillable');

        if ($property?->isStatic()) {
            $errors = [Shared::error($property, '$fillable must not be static.', __METHOD__)];

            return $errors;
        }

        if ($property === null) {
            $errors = [Shared::error($node, 'Model must explicitly declare protected $fillable.', __METHOD__)];

            return $errors;
        }

        if (! $property->isProtected()) {
            $errors = [Shared::error($property, '$fillable must be protected.', __METHOD__)];

            return $errors;
        }

        $default = $this->getPropertyValue($property, 'fillable');
        if ($default === null || ! $scope->getType($default)->isArray()->yes()) {
            $errors = [Shared::error($property, '$fillable must default to an array.', __METHOD__)];

            return $errors;
        }

        $type = $scope->getType($default);

        if ($type->isIterableAtLeastOnce()->no()) {
            return [];
        }

        if (! $type->getIterableValueType()->isString()->yes()) {
            $errors = [Shared::error($property, '$fillable must contain only strings.', __METHOD__)];

            return $errors;
        }

        foreach ($type->getConstantArrays() as $array) {
            $seen = [];

            foreach ($array->getValueTypes() as $value) {
                foreach ($seen as $previous) {
                    if ($value->equals($previous)) {
                        $errors = [Shared::error($property, '$fillable must not contain duplicate entries.', __METHOD__)];

                        return $errors;
                    }
                }

                $seen[] = $value;
            }
        }

        return [];
    }

    private function requirePropertyHidden(InClassNode $node, Scope $scope): array
    {
        $property = $this->getProperty($node, 'hidden');

        if ($property?->isStatic()) {
            $errors = [Shared::error($property, '$hidden must not be static.', __METHOD__)];

            return $errors;
        }

        if ($property === null) {
            $errors = [Shared::error($node, 'Model must explicitly declare protected $hidden.', __METHOD__)];

            return $errors;
        }

        if (! $property->isProtected()) {
            $errors = [Shared::error($property, '$hidden must be protected.', __METHOD__)];

            return $errors;
        }

        $default = $this->getPropertyValue($property, 'hidden');
        if ($default === null || ! $scope->getType($default)->isArray()->yes()) {
            $errors = [Shared::error($property, '$hidden must default to an array.', __METHOD__)];

            return $errors;
        }

        $type = $scope->getType($default);

        if ($type->isIterableAtLeastOnce()->no()) {
            return [];
        }

        if (! $type->getIterableValueType()->isString()->yes()) {
            $errors = [Shared::error($property, '$hidden must contain only strings.', __METHOD__)];

            return $errors;
        }

        foreach ($type->getConstantArrays() as $array) {
            $seen = [];

            foreach ($array->getValueTypes() as $value) {
                foreach ($seen as $previous) {
                    if ($value->equals($previous)) {
                        $errors = [Shared::error($property, '$hidden must not contain duplicate entries.', __METHOD__)];

                        return $errors;
                    }
                }

                $seen[] = $value;
            }
        }

        return [];
    }

    private function requirePropertyCasts(InClassNode $node, Scope $scope): array
    {
        $property = $this->getProperty($node, 'casts');

        if ($property?->isStatic()) {
            $errors = [Shared::error($property, '$casts must not be static.', __METHOD__)];

            return $errors;
        }

        if ($property === null) {
            $errors = [Shared::error($node, 'Model must explicitly declare protected $casts.', __METHOD__)];

            return $errors;
        }

        if (! $property->isProtected()) {
            $errors = [Shared::error($property, '$casts must be protected.', __METHOD__)];

            return $errors;
        }

        $default = $this->getPropertyValue($property, 'casts');

        if ($default === null || ! $scope->getType($default)->isArray()->yes()) {
            $errors = [Shared::error($property, '$casts must default to an array.', __METHOD__)];

            return $errors;
        }

        $type = $scope->getType($default);

        if (! $type->isIterableAtLeastOnce()->no() && ! $type->getIterableKeyType()->isString()->yes()) {
            $errors = [Shared::error($property, '$casts must use string attribute keys.', __METHOD__)];

            return $errors;
        }

        return [];
    }

    private function rejectOverlapBetweenGuardedAndFillable(InClassNode $node, Scope $scope): array
    {
        $fillable = $this->getProperty($node, 'fillable');
        $guarded = $this->getProperty($node, 'guarded');

        if ($fillable === null || $guarded === null) {
            return [];
        }

        $fillableDefault = $this->getPropertyValue($fillable, 'fillable');
        $guardedDefault = $this->getPropertyValue($guarded, 'guarded');

        if ($fillableDefault === null || $guardedDefault === null) {
            return [];
        }

        $fillableValues = $scope->getType($fillableDefault)->getIterableValueType()->getConstantStrings();
        $guardedValues = $scope->getType($guardedDefault)->getIterableValueType()->getConstantStrings();

        foreach ($fillableValues as $fillableValue) {
            foreach ($guardedValues as $guardedValue) {
                if ($fillableValue->equals($guardedValue)) {
                    $errors = [Shared::error($fillable, '$fillable and $guarded must not overlap.', __METHOD__)];

                    return $errors;
                }
            }
        }

        return [];
    }
}
