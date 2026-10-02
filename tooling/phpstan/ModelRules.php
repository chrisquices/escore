<?php

namespace Escore\PHPStan;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Attributes\Unguarded;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Pivot;
use PhpParser\Node;
use PhpParser\Node\Expr;
use PHPStan\Analyser\Scope;
use PHPStan\Node\InClassNode;
use PHPStan\Reflection\ClassReflection;
use PHPStan\Reflection\InitializerExprContext;
use PHPStan\Reflection\InitializerExprTypeResolver;
use PHPStan\Rules\Rule;
use PHPStan\Rules\RuleError;
use PHPStan\Rules\RuleErrorBuilder;
use PHPStan\Type\Constant\ConstantArrayType;
use PHPStan\Type\Constant\ConstantStringType;
use PHPStan\Type\Type;
use TypeError;

/** @implements Rule<InClassNode> */
class ModelRules implements Rule
{
    public function __construct(private readonly InitializerExprTypeResolver $initializerExprTypeResolver) {}

    public function getNodeType(): string
    {
        return InClassNode::class;
    }

    /** @return list<RuleError> */
    public function processNode(Node $node, Scope $scope): array
    {
        if (! $node->getClassReflection()->isSubclassOf(Model::class)) {
            return [];
        }

        return [
            ...$this->requirePropertiesToBeAllowed($node),
            ...$this->noOverlappingFillableAndGuarded($node),
            ...$this->requirePropertyTable($node),
            ...$this->requirePropertyTableToBeProtected($node),
            ...$this->requirePropertyTableToBeNonEmptyString($node, $scope),
            ...$this->requirePropertyGuarded($node),
            ...$this->requirePropertyGuardedToBeProtected($node),
            ...$this->requirePropertyGuardedToContainPrimaryKey($node, $scope),
            ...$this->requirePropertyFillable($node),
            ...$this->requirePropertyFillableToBeProtected($node),
            ...$this->requirePropertyFillableToBeArray($node, $scope),
            ...$this->requirePropertyFillableToContainOnlyStrings($node, $scope),
            ...$this->requirePropertyFillableToHaveUniqueValues($node, $scope),
            ...$this->requirePropertyHidden($node),
            ...$this->requirePropertyHiddenToBeProtected($node),
            ...$this->requirePropertyHiddenToBeArray($node, $scope),
            ...$this->requirePropertyHiddenToContainOnlyStrings($node, $scope),
            ...$this->requirePropertyHiddenToHaveUniqueValues($node, $scope),
            ...$this->requirePropertyCasts($node),
            ...$this->requirePropertyCastsToBeProtected($node),
            ...$this->requirePropertyCastsToBeArray($node, $scope),
            ...$this->requirePropertyCastsToHaveStringKeys($node, $scope),
        ];
    }

    /** @return list<RuleError> */
    private function requirePropertiesToBeAllowed(InClassNode $node): array
    {
        $class = $node->getOriginalNode();
        $allowed = ['table', 'guarded', 'fillable', 'hidden', 'casts', 'primaryKey'];
        $declarations = [];

        foreach ($class->getProperties() as $property) {
            foreach ($property->props as $item) {
                $declarations[] = ['name' => $item->name->toString(), 'line' => $item->getStartLine()];
            }
        }

        foreach ($class->getMethod('__construct')?->params ?? [] as $parameter) {
            if ($parameter->isPromoted() && $parameter->var instanceof Expr\Variable && is_string($parameter->var->name)) {
                $declarations[] = ['name' => $parameter->var->name, 'line' => $parameter->getStartLine()];
            }
        }

        $errors = [];

        foreach ($declarations as $declaration) {
            if (in_array($declaration['name'], $allowed, true)) {
                continue;
            }

            $errors[] = RuleErrorBuilder::message('Model property $'.$declaration['name'].' is not supported by ModelRules. Keep this property and add support for it in ModelRules.php, including any required dedicated rules. Do not remove the property to silence this violation.')
                ->identifier('escore.model.requirePropertiesToBeAllowed')
                ->line($declaration['line'])
                ->build();
        }

        return $errors;
    }

    /** @return list<RuleError> */
    private function noOverlappingFillableAndGuarded(InClassNode $node): array
    {
        $model = $node->getClassReflection();
        $fillable = $this->propertyColumns($model, 'fillable');
        $guarded = $this->propertyColumns($model, 'guarded');
        $attributeFillable = $this->attributeColumns($this->classAttribute($model, Fillable::class));

        // Unknown declarations must not be mistaken for empty lists.
        if ($fillable === null || $guarded === null || $attributeFillable === null) {
            return [];
        }

        $fillable = array_unique(array_merge($fillable, $attributeFillable));
        $defaultGuarded = $model->is(Pivot::class) ? [] : ['*'];

        // Laravel consults these attributes only while guarded equals its default.
        if ($guarded === $defaultGuarded) {
            if ($this->classAttribute($model, Unguarded::class) !== null) {
                $guarded = [];
            } elseif (($attribute = $this->classAttribute($model, Guarded::class)) !== null) {
                $guarded = $this->attributeColumns($attribute);
            }
        }

        if ($guarded === null) {
            return [];
        }

        $guarded = array_filter($guarded, static function (string $column): bool {
            return $column !== '*';
        });
        $errors = [];

        foreach ($fillable as $column) {
            // Match Laravel's case-insensitive named guards; never expand '*'.
            if ($column === '*' || empty(preg_grep('/^'.preg_quote($column, '/').'$/i', $guarded))) {
                continue;
            }

            $errors[] = RuleErrorBuilder::message('Attribute "'.$column.'" is both fillable and guarded. Laravel allows it through fillable. Remove it from the list that contradicts your intended behavior.')
                ->identifier('escore.model.noOverlappingFillableAndGuarded')
                ->line($node->getStartLine())
                ->build();
        }

        return $errors;
    }

    /** @return list<RuleError> */
    private function requirePropertyTable(InClassNode $node): array
    {
        $class = $node->getOriginalNode();

        if ($class->getProperty('table') !== null) {
            return [];
        }

        foreach ($class->getMethod('__construct')?->params ?? [] as $parameter) {
            if ($parameter->isPromoted() && $parameter->var instanceof Expr\Variable && $parameter->var->name === 'table') {
                return [];
            }
        }

        return [
            RuleErrorBuilder::message('Model must explicitly declare a $table property.')
                ->identifier('escore.model.requirePropertyTable')
                ->line($node->getStartLine())
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function requirePropertyTableToBeProtected(InClassNode $node): array
    {
        $class = $node->getOriginalNode();
        $property = $class->getProperty('table');

        if ($property === null) {
            foreach ($class->getMethod('__construct')?->params ?? [] as $parameter) {
                if ($parameter->isPromoted() && $parameter->var instanceof Expr\Variable && $parameter->var->name === 'table') {
                    $property = $parameter;

                    break;
                }
            }
        }

        if ($property === null || $property->isProtected()) {
            return [];
        }

        return [
            RuleErrorBuilder::message('$table must be protected.')
                ->identifier('escore.model.requirePropertyTableToBeProtected')
                ->line($property->getStartLine())
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function requirePropertyTableToBeNonEmptyString(InClassNode $node, Scope $scope): array
    {
        $class = $node->getOriginalNode();
        $property = $class->getProperty('table');
        $declaration = null;

        if ($property !== null) {
            foreach ($property->props as $item) {
                if ($item->name->toString() === 'table') {
                    $declaration = $item;

                    break;
                }
            }
        } else {
            foreach ($class->getMethod('__construct')?->params ?? [] as $parameter) {
                if ($parameter->isPromoted() && $parameter->var instanceof Expr\Variable && $parameter->var->name === 'table') {
                    $declaration = $parameter;

                    break;
                }
            }
        }

        if ($declaration === null) {
            return [];
        }

        $default = $declaration->default;

        if ($default !== null && $scope->getType($default)->isNonEmptyString()->yes()) {
            return [];
        }

        return [
            RuleErrorBuilder::message('$table must have a nonempty string default.')
                ->identifier('escore.model.requirePropertyTableToBeNonEmptyString')
                ->line(($default ?? $declaration)->getStartLine())
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function requirePropertyGuarded(InClassNode $node): array
    {
        $class = $node->getOriginalNode();

        if ($class->getProperty('guarded') !== null) {
            return [];
        }

        foreach ($class->getMethod('__construct')?->params ?? [] as $parameter) {
            if ($parameter->isPromoted() && $parameter->var instanceof Expr\Variable && $parameter->var->name === 'guarded') {
                return [];
            }
        }

        return [
            RuleErrorBuilder::message('Model must explicitly declare a $guarded property.')
                ->identifier('escore.model.requirePropertyGuarded')
                ->line($node->getStartLine())
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function requirePropertyGuardedToBeProtected(InClassNode $node): array
    {
        $class = $node->getOriginalNode();
        $property = $class->getProperty('guarded');

        if ($property === null) {
            foreach ($class->getMethod('__construct')?->params ?? [] as $parameter) {
                if ($parameter->isPromoted() && $parameter->var instanceof Expr\Variable && $parameter->var->name === 'guarded') {
                    $property = $parameter;

                    break;
                }
            }
        }

        if ($property === null || $property->isProtected()) {
            return [];
        }

        return [
            RuleErrorBuilder::message('$guarded must be protected.')
                ->identifier('escore.model.requirePropertyGuardedToBeProtected')
                ->line($property->getStartLine())
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function requirePropertyGuardedToContainPrimaryKey(InClassNode $node, Scope $scope): array
    {
        $class = $node->getOriginalNode();
        $property = $class->getProperty('guarded');
        $declaration = null;

        if ($property !== null) {
            foreach ($property->props as $item) {
                if ($item->name->toString() === 'guarded') {
                    $declaration = $item;

                    break;
                }
            }
        } else {
            foreach ($class->getMethod('__construct')?->params ?? [] as $parameter) {
                if ($parameter->isPromoted() && $parameter->var instanceof Expr\Variable && $parameter->var->name === 'guarded') {
                    $declaration = $parameter;

                    break;
                }
            }
        }

        if ($declaration === null) {
            return [];
        }

        $model = $node->getClassReflection();
        $reflection = $model->getNativeReflection();

        if (! $reflection->hasProperty('primaryKey')) {
            return [];
        }

        // Read declarations only; constructor assignments and runtime key changes are not traced.
        $keyProperty = $reflection->getProperty('primaryKey');
        $declaringClass = $keyProperty->getDeclaringClass();
        $keyExpression = null;

        if ($keyProperty->isPromoted()) {
            foreach ($declaringClass->getConstructor()?->getParameters() ?? [] as $parameter) {
                if ($parameter->isPromoted() && $parameter->getName() === 'primaryKey' && $parameter->isDefaultValueAvailable()) {
                    $keyExpression = $parameter->getDefaultValueExpression();

                    break;
                }
            }
        } else {
            try {
                $keyExpression = $keyProperty->getDefaultValueExpression();
            } catch (TypeError) {
                // PHPStan's adapter can throw when a property has no default.
                return [];
            }
        }

        if ($keyExpression === null) {
            return [];
        }

        $context = InitializerExprContext::fromClass($declaringClass->getName(), $declaringClass->getFileName() ?: null);
        $keyType = $this->initializerExprTypeResolver->getType($keyExpression, $context);

        if (! $keyType instanceof ConstantStringType) {
            return [];
        }

        $primaryKey = $keyType->getValue();

        // Laravel applies Table.key only while primaryKey is exactly its default 'id'.
        if ($primaryKey === 'id' && ($attribute = $this->classAttribute($model, Table::class)) !== null) {
            $keyArgument = $attribute['arguments']['key'] ?? $attribute['arguments'][1] ?? null;

            if ($keyArgument !== null) {
                $attributeKeyType = $this->initializerExprTypeResolver->getType($keyArgument, $attribute['context']);

                if ($attributeKeyType instanceof ConstantStringType) {
                    $primaryKey = $attributeKeyType->getValue();
                } elseif (! $attributeKeyType->isNull()->yes()) {
                    return [];
                }
            }
        }

        $default = $declaration->default;

        if ($default !== null) {
            $guardedType = $scope->getType($default);

            if ($guardedType instanceof ConstantArrayType && $guardedType->isConstantValue()->yes() && $guardedType->getOptionalKeys() === []) {
                foreach ($guardedType->getValueTypes() as $column) {
                    // Named guards match case-insensitively; '*' is not an explicit column.
                    if ($column instanceof ConstantStringType && $column->getValue() !== '*' && preg_match('/^'.preg_quote($primaryKey, '/').'$/i', $column->getValue()) === 1) {
                        return [];
                    }
                }
            } elseif (! $guardedType->isArray()->no()) {
                // An unknown list cannot prove that the configured key is absent.
                return [];
            }
        }

        return [
            RuleErrorBuilder::message('$guarded must explicitly include the primary-key column "'.$primaryKey.'".')
                ->identifier('escore.model.requirePropertyGuardedToContainPrimaryKey')
                ->line(($default ?? $declaration)->getStartLine())
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function requirePropertyFillable(InClassNode $node): array
    {
        $class = $node->getOriginalNode();

        if ($class->getProperty('fillable') !== null) {
            return [];
        }

        foreach ($class->getMethod('__construct')?->params ?? [] as $parameter) {
            if ($parameter->isPromoted() && $parameter->var instanceof Expr\Variable && $parameter->var->name === 'fillable') {
                return [];
            }
        }

        return [
            RuleErrorBuilder::message('Model must explicitly declare a $fillable property.')
                ->identifier('escore.model.requirePropertyFillable')
                ->line($node->getStartLine())
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function requirePropertyFillableToBeProtected(InClassNode $node): array
    {
        $class = $node->getOriginalNode();
        $property = $class->getProperty('fillable');

        if ($property === null) {
            foreach ($class->getMethod('__construct')?->params ?? [] as $parameter) {
                if ($parameter->isPromoted() && $parameter->var instanceof Expr\Variable && $parameter->var->name === 'fillable') {
                    $property = $parameter;

                    break;
                }
            }
        }

        if ($property === null || $property->isProtected()) {
            return [];
        }

        return [
            RuleErrorBuilder::message('$fillable must be protected.')
                ->identifier('escore.model.requirePropertyFillableToBeProtected')
                ->line($property->getStartLine())
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function requirePropertyFillableToBeArray(InClassNode $node, Scope $scope): array
    {
        $class = $node->getOriginalNode();
        $property = $class->getProperty('fillable');
        $declaration = null;

        if ($property !== null) {
            foreach ($property->props as $item) {
                if ($item->name->toString() === 'fillable') {
                    $declaration = $item;

                    break;
                }
            }
        } else {
            foreach ($class->getMethod('__construct')?->params ?? [] as $parameter) {
                if ($parameter->isPromoted() && $parameter->var instanceof Expr\Variable && $parameter->var->name === 'fillable') {
                    $declaration = $parameter;

                    break;
                }
            }
        }

        if ($declaration === null) {
            return [];
        }

        $default = $declaration->default;

        if ($default !== null && $scope->getType($default)->isArray()->yes()) {
            return [];
        }

        return [
            RuleErrorBuilder::message('$fillable must have an array default.')
                ->identifier('escore.model.requirePropertyFillableToBeArray')
                ->line(($default ?? $declaration)->getStartLine())
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function requirePropertyFillableToContainOnlyStrings(InClassNode $node, Scope $scope): array
    {
        $class = $node->getOriginalNode();
        $property = $class->getProperty('fillable');
        $declaration = null;

        if ($property !== null) {
            foreach ($property->props as $item) {
                if ($item->name->toString() === 'fillable') {
                    $declaration = $item;

                    break;
                }
            }
        } else {
            foreach ($class->getMethod('__construct')?->params ?? [] as $parameter) {
                if ($parameter->isPromoted() && $parameter->var instanceof Expr\Variable && $parameter->var->name === 'fillable') {
                    $declaration = $parameter;

                    break;
                }
            }
        }

        if ($declaration === null || $declaration->default === null) {
            return [];
        }

        $default = $declaration->default;
        $fillableType = $scope->getType($default);

        if (! $fillableType->isArray()->yes() || $fillableType->isIterableAtLeastOnce()->no()) {
            return [];
        }

        if ($fillableType->getIterableValueType()->isString()->yes()) {
            return [];
        }

        return [
            RuleErrorBuilder::message('$fillable must contain only string values.')
                ->identifier('escore.model.requirePropertyFillableToContainOnlyStrings')
                ->line($default->getStartLine())
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function requirePropertyFillableToHaveUniqueValues(InClassNode $node, Scope $scope): array
    {
        $class = $node->getOriginalNode();
        $property = $class->getProperty('fillable');
        $declaration = null;

        if ($property !== null) {
            foreach ($property->props as $item) {
                if ($item->name->toString() === 'fillable') {
                    $declaration = $item;

                    break;
                }
            }
        } else {
            foreach ($class->getMethod('__construct')?->params ?? [] as $parameter) {
                if ($parameter->isPromoted() && $parameter->var instanceof Expr\Variable && $parameter->var->name === 'fillable') {
                    $declaration = $parameter;

                    break;
                }
            }
        }

        if ($declaration === null || $declaration->default === null) {
            return [];
        }

        $default = $declaration->default;
        $fillableType = $scope->getType($default);

        if (! $fillableType instanceof ConstantArrayType) {
            return [];
        }

        $seen = [];
        $optionalKeys = $fillableType->getOptionalKeys();

        foreach ($fillableType->getValueTypes() as $index => $valueType) {
            // Only required, concrete values prove that repeated entries coexist.
            if (in_array($index, $optionalKeys, true) || ! $valueType instanceof ConstantStringType) {
                continue;
            }

            $value = $valueType->getValue();

            if (in_array($value, $seen, true)) {
                return [
                    RuleErrorBuilder::message('$fillable must contain unique values. Remove the repeated "'.$value.'" entry.')
                        ->identifier('escore.model.requirePropertyFillableToHaveUniqueValues')
                        ->line($default->getStartLine())
                        ->build(),
                ];
            }

            $seen[] = $value;
        }

        return [];
    }

    /** @return list<RuleError> */
    private function requirePropertyHidden(InClassNode $node): array
    {
        $class = $node->getOriginalNode();

        if ($class->getProperty('hidden') !== null) {
            return [];
        }

        foreach ($class->getMethod('__construct')?->params ?? [] as $parameter) {
            if ($parameter->isPromoted() && $parameter->var instanceof Expr\Variable && $parameter->var->name === 'hidden') {
                return [];
            }
        }

        return [
            RuleErrorBuilder::message('Model must explicitly declare a $hidden property.')
                ->identifier('escore.model.requirePropertyHidden')
                ->line($node->getStartLine())
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function requirePropertyHiddenToBeProtected(InClassNode $node): array
    {
        $class = $node->getOriginalNode();
        $property = $class->getProperty('hidden');

        if ($property === null) {
            foreach ($class->getMethod('__construct')?->params ?? [] as $parameter) {
                if ($parameter->isPromoted() && $parameter->var instanceof Expr\Variable && $parameter->var->name === 'hidden') {
                    $property = $parameter;

                    break;
                }
            }
        }

        if ($property === null || $property->isProtected()) {
            return [];
        }

        return [
            RuleErrorBuilder::message('$hidden must be protected.')
                ->identifier('escore.model.requirePropertyHiddenToBeProtected')
                ->line($property->getStartLine())
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function requirePropertyHiddenToBeArray(InClassNode $node, Scope $scope): array
    {
        $class = $node->getOriginalNode();
        $property = $class->getProperty('hidden');
        $declaration = null;

        if ($property !== null) {
            foreach ($property->props as $item) {
                if ($item->name->toString() === 'hidden') {
                    $declaration = $item;

                    break;
                }
            }
        } else {
            foreach ($class->getMethod('__construct')?->params ?? [] as $parameter) {
                if ($parameter->isPromoted() && $parameter->var instanceof Expr\Variable && $parameter->var->name === 'hidden') {
                    $declaration = $parameter;

                    break;
                }
            }
        }

        if ($declaration === null) {
            return [];
        }

        $default = $declaration->default;

        if ($default !== null && $scope->getType($default)->isArray()->yes()) {
            return [];
        }

        return [
            RuleErrorBuilder::message('$hidden must have an array default.')
                ->identifier('escore.model.requirePropertyHiddenToBeArray')
                ->line(($default ?? $declaration)->getStartLine())
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function requirePropertyHiddenToContainOnlyStrings(InClassNode $node, Scope $scope): array
    {
        $class = $node->getOriginalNode();
        $property = $class->getProperty('hidden');
        $declaration = null;

        if ($property !== null) {
            foreach ($property->props as $item) {
                if ($item->name->toString() === 'hidden') {
                    $declaration = $item;

                    break;
                }
            }
        } else {
            foreach ($class->getMethod('__construct')?->params ?? [] as $parameter) {
                if ($parameter->isPromoted() && $parameter->var instanceof Expr\Variable && $parameter->var->name === 'hidden') {
                    $declaration = $parameter;

                    break;
                }
            }
        }

        if ($declaration === null || $declaration->default === null) {
            return [];
        }

        $default = $declaration->default;
        $hiddenType = $scope->getType($default);

        if (! $hiddenType->isArray()->yes() || $hiddenType->isIterableAtLeastOnce()->no()) {
            return [];
        }

        if ($hiddenType->getIterableValueType()->isString()->yes()) {
            return [];
        }

        return [
            RuleErrorBuilder::message('$hidden must contain only string values.')
                ->identifier('escore.model.requirePropertyHiddenToContainOnlyStrings')
                ->line($default->getStartLine())
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function requirePropertyHiddenToHaveUniqueValues(InClassNode $node, Scope $scope): array
    {
        $class = $node->getOriginalNode();
        $property = $class->getProperty('hidden');
        $declaration = null;

        if ($property !== null) {
            foreach ($property->props as $item) {
                if ($item->name->toString() === 'hidden') {
                    $declaration = $item;

                    break;
                }
            }
        } else {
            foreach ($class->getMethod('__construct')?->params ?? [] as $parameter) {
                if ($parameter->isPromoted() && $parameter->var instanceof Expr\Variable && $parameter->var->name === 'hidden') {
                    $declaration = $parameter;

                    break;
                }
            }
        }

        if ($declaration === null || $declaration->default === null) {
            return [];
        }

        $default = $declaration->default;
        $hiddenType = $scope->getType($default);

        if (! $hiddenType instanceof ConstantArrayType) {
            return [];
        }

        $seen = [];
        $optionalKeys = $hiddenType->getOptionalKeys();

        foreach ($hiddenType->getValueTypes() as $index => $valueType) {
            // Only required, concrete values prove that repeated entries coexist.
            if (in_array($index, $optionalKeys, true) || ! $valueType instanceof ConstantStringType) {
                continue;
            }

            $value = $valueType->getValue();

            if (in_array($value, $seen, true)) {
                return [
                    RuleErrorBuilder::message('$hidden must contain unique values. Remove the repeated "'.$value.'" entry.')
                        ->identifier('escore.model.requirePropertyHiddenToHaveUniqueValues')
                        ->line($default->getStartLine())
                        ->build(),
                ];
            }

            $seen[] = $value;
        }

        return [];
    }

    /** @return list<RuleError> */
    private function requirePropertyCasts(InClassNode $node): array
    {
        $class = $node->getOriginalNode();

        if ($class->getProperty('casts') !== null) {
            return [];
        }

        foreach ($class->getMethod('__construct')?->params ?? [] as $parameter) {
            if ($parameter->isPromoted() && $parameter->var instanceof Expr\Variable && $parameter->var->name === 'casts') {
                return [];
            }
        }

        return [
            RuleErrorBuilder::message('Model must explicitly declare a $casts property.')
                ->identifier('escore.model.requirePropertyCasts')
                ->line($node->getStartLine())
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function requirePropertyCastsToBeProtected(InClassNode $node): array
    {
        $class = $node->getOriginalNode();
        $property = $class->getProperty('casts');

        if ($property === null) {
            foreach ($class->getMethod('__construct')?->params ?? [] as $parameter) {
                if ($parameter->isPromoted() && $parameter->var instanceof Expr\Variable && $parameter->var->name === 'casts') {
                    $property = $parameter;

                    break;
                }
            }
        }

        if ($property === null || $property->isProtected()) {
            return [];
        }

        return [
            RuleErrorBuilder::message('$casts must be protected.')
                ->identifier('escore.model.requirePropertyCastsToBeProtected')
                ->line($property->getStartLine())
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function requirePropertyCastsToBeArray(InClassNode $node, Scope $scope): array
    {
        $class = $node->getOriginalNode();
        $property = $class->getProperty('casts');
        $declaration = null;

        if ($property !== null) {
            foreach ($property->props as $item) {
                if ($item->name->toString() === 'casts') {
                    $declaration = $item;

                    break;
                }
            }
        } else {
            foreach ($class->getMethod('__construct')?->params ?? [] as $parameter) {
                if ($parameter->isPromoted() && $parameter->var instanceof Expr\Variable && $parameter->var->name === 'casts') {
                    $declaration = $parameter;

                    break;
                }
            }
        }

        if ($declaration === null) {
            return [];
        }

        $default = $declaration->default;

        if ($default !== null && $scope->getType($default)->isArray()->yes()) {
            return [];
        }

        return [
            RuleErrorBuilder::message('$casts must have an array default.')
                ->identifier('escore.model.requirePropertyCastsToBeArray')
                ->line(($default ?? $declaration)->getStartLine())
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function requirePropertyCastsToHaveStringKeys(InClassNode $node, Scope $scope): array
    {
        $class = $node->getOriginalNode();
        $property = $class->getProperty('casts');
        $declaration = null;

        if ($property !== null) {
            foreach ($property->props as $item) {
                if ($item->name->toString() === 'casts') {
                    $declaration = $item;

                    break;
                }
            }
        } else {
            foreach ($class->getMethod('__construct')?->params ?? [] as $parameter) {
                if ($parameter->isPromoted() && $parameter->var instanceof Expr\Variable && $parameter->var->name === 'casts') {
                    $declaration = $parameter;

                    break;
                }
            }
        }

        if ($declaration === null || $declaration->default === null) {
            return [];
        }

        $default = $declaration->default;
        $castsType = $scope->getType($default);

        if (! $castsType->isArray()->yes() || $castsType->isIterableAtLeastOnce()->no()) {
            return [];
        }

        if ($castsType->getIterableKeyType()->isString()->yes()) {
            return [];
        }

        return [
            RuleErrorBuilder::message('$casts must use string attribute names as array keys.')
                ->identifier('escore.model.requirePropertyCastsToHaveStringKeys')
                ->line($default->getStartLine())
                ->build(),
        ];
    }

    /** @return array<int|string, string>|null */
    private function propertyColumns(ClassReflection $model, string $name): ?array
    {
        $reflection = $model->getNativeReflection();

        if (! $reflection->hasProperty($name)) {
            return null;
        }

        $property = $reflection->getProperty($name);

        try {
            $expression = $property->getDefaultValueExpression();
        } catch (TypeError) {
            // PHPStan's adapter has a non-null return type even for no default.
            return null;
        }

        $declaringClass = $property->getDeclaringClass();
        $context = InitializerExprContext::fromClass($declaringClass->getName(), $declaringClass->getFileName() ?: null);

        return $this->stringArray($this->initializerExprTypeResolver->getType($expression, $context));
    }

    /**
     * @param class-string $attributeName
     * @return array{arguments: array<int|string, Expr>, context: InitializerExprContext}|null
     */
    private function classAttribute(ClassReflection $model, string $attributeName): ?array
    {
        do {
            // Laravel checks the class, its direct traits, then its parent.
            foreach ([$model, ...array_values($model->getTraits())] as $source) {
                $attributes = $source->getNativeReflection()->getAttributes($attributeName);

                if ($attributes !== []) {
                    return [
                        'arguments' => $attributes[0]->getArgumentsExpressions(),
                        'context' => InitializerExprContext::fromClassReflection($source),
                    ];
                }
            }

            $model = $model->getParentClass();
        } while ($model !== null);

        return null;
    }

    /**
     * @param array{arguments: array<int|string, Expr>, context: InitializerExprContext}|null $attribute
     * @return array<int|string, string>|null
     */
    private function attributeColumns(?array $attribute): ?array
    {
        if ($attribute === null || $attribute['arguments'] === []) {
            return [];
        }

        $types = [];

        foreach ($attribute['arguments'] as $key => $expression) {
            $types[$key] = $this->initializerExprTypeResolver->getType($expression, $attribute['context']);
        }

        // Both Laravel attributes use the first positional array when present.
        // Otherwise their variadic arguments must all be concrete strings.
        if (isset($types[0]) && $types[0]->isArray()->yes()) {
            return $this->stringArray($types[0]);
        }

        $columns = [];

        foreach ($types as $key => $type) {
            if (! $type instanceof ConstantStringType) {
                return null;
            }

            $columns[$key] = $type->getValue();
        }

        return $columns;
    }

    /** @return array<int|string, string>|null */
    private function stringArray(Type $type): ?array
    {
        if (! $type instanceof ConstantArrayType || ! $type->isConstantValue()->yes() || $type->getOptionalKeys() !== []) {
            return null;
        }

        $columns = [];
        $keys = $type->getKeyTypes();

        foreach ($type->getValueTypes() as $index => $value) {
            if (! $value instanceof ConstantStringType) {
                return null;
            }

            $columns[$keys[$index]->getValue()] = $value->getValue();
        }

        return $columns;
    }
}
