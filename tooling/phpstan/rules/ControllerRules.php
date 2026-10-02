<?php

namespace Strata\PHPStan;

use Illuminate\Contracts\Validation\Factory as ValidationFactory;
use Illuminate\Contracts\Validation\ValidatesWhenResolved;
use Illuminate\Contracts\Validation\Validator as ValidatorContract;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\Query\Builder as QueryBuilder;
use Illuminate\Foundation\Validation\ValidatesRequests;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Request as RequestFacade;
use Illuminate\Support\Facades\Validator as ValidatorFacade;
use Illuminate\Validation\Validator;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;
use Inertia\ResponseFactory;
use PhpParser\Node;
use PhpParser\Node\Expr\Array_;
use PhpParser\Node\Expr\ArrayDimFetch;
use PhpParser\Node\Expr\ClassConstFetch;
use PhpParser\Node\Expr\Clone_;
use PhpParser\Node\Expr\FuncCall;
use PhpParser\Node\Expr\Instanceof_;
use PhpParser\Node\Expr\MethodCall;
use PhpParser\Node\Expr\New_;
use PhpParser\Node\Expr\NullsafeMethodCall;
use PhpParser\Node\Expr\NullsafePropertyFetch;
use PhpParser\Node\Expr\PropertyFetch;
use PhpParser\Node\Expr\StaticCall;
use PhpParser\Node\Expr\StaticPropertyFetch;
use PhpParser\Node\Expr\Variable;
use PhpParser\Node\FunctionLike;
use PhpParser\Node\Identifier;
use PhpParser\Node\IntersectionType;
use PhpParser\Node\Name;
use PhpParser\Node\NullableType;
use PhpParser\Node\Scalar\String_;
use PhpParser\Node\Stmt\ClassMethod;
use PhpParser\Node\Stmt\GroupUse;
use PhpParser\Node\Stmt\Use_;
use PhpParser\Node\UnionType;
use PHPStan\Analyser\Scope;
use PHPStan\Node\InClassNode;
use PHPStan\Node\MethodReturnStatementsNode;
use PHPStan\Reflection\ReflectionProvider;
use PHPStan\Rules\Rule;
use PHPStan\Rules\RuleError;
use PHPStan\Rules\RuleErrorBuilder;
use PHPStan\Type\ObjectType;
use PHPStan\Type\Type;
use PHPStan\Type\TypeCombinator;
use PHPStan\Type\VerbosityLevel;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

/** @implements Rule<Node> */
class ControllerRules implements Rule
{
    public function __construct(private readonly ReflectionProvider $reflectionProvider) {}

    public function getNodeType(): string
    {
        return Node::class;
    }

    /** @return list<RuleError> */
    public function processNode(Node $node, Scope $scope): array
    {
        if ($node instanceof InClassNode) {
            return $this->noInvokableControllers($node, $scope);
        }

        // Imports are visited outside the class scope. Limit this file-level check
        // to conventional controller namespaces or source directories.
        if ($node instanceof Use_ || $node instanceof GroupUse) {
            return $this->isControllerFile($scope) ? $this->noModelUsage($node, $scope) : [];
        }

        $controller = $scope->getClassReflection();

        if ($controller === null || (! $controller->is('App\\Http\\Controllers\\Controller') && ! $controller->is(Controller::class))) {
            return [];
        }

        $modelErrors = $this->noModelUsage($node, $scope);

        return [
            ...$modelErrors,
            ...($modelErrors === [] ? $this->noEloquentQueries($node, $scope) : []),
            ...$this->noRequestValidation($node, $scope),
            ...$this->noInlineInertiaProps($node, $scope),
            ...$this->noNonVariableInertiaProps($node, $scope),
            ...$this->noMismatchedInertiaPropNames($node, $scope),
            ...$this->noRouteModelBinding($node, $scope),
            ...$this->allowedReturnTypes($node),
            ...$this->noArithmeticOperations($node, $scope),
            ...$this->noLoopStatements($node),
            ...$this->noPositionalArguments($node),
        ];
    }

    private function isControllerFile(Scope $scope): bool
    {
        $namespace = $scope->getNamespace() ?? '';
        $file = str_replace('\\', '/', $scope->getFile());

        return $namespace === 'App\\Http\\Controllers'
            || str_starts_with($namespace, 'App\\Http\\Controllers\\')
            || str_contains($file, '/app/Http/Controllers/');
    }

    /** @return list<RuleError> */
    private function noInvokableControllers(InClassNode $node, Scope $scope): array
    {
        $controller = $node->getClassReflection();

        if (! $node->getOriginalNode() instanceof Node\Stmt\Class_
            || (! $this->isControllerFile($scope)
                && ! $controller->is('App\\Http\\Controllers\\Controller')
                && ! $controller->is(Controller::class))
            || ! $controller->hasNativeMethod('__invoke')) {
            return [];
        }

        return [
            RuleErrorBuilder::message('Invokable controllers are forbidden. Do not define or inherit __invoke(). Move the action into an explicitly named method on a controller for its model, module, or domain.')
                ->identifier('strata.controller.noInvokableControllers')
                ->line($node->getStartLine())
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function noModelUsage(Node $node, Scope $scope): array
    {
        if ($node->getAttribute('virtualNullsafeMethodCall', false) || $node->getAttribute('virtualNullsafePropertyFetch', false)) {
            return [];
        }

        $references = [];
        $receiverType = null;

        if ($node instanceof Use_ || $node instanceof GroupUse) {
            foreach ($node->uses as $use) {
                $importType = $use->type === Use_::TYPE_UNKNOWN ? $node->type : $use->type;

                if ($importType !== Use_::TYPE_NORMAL) {
                    continue;
                }

                $className = ($node instanceof GroupUse ? $node->prefix->toString().'\\' : '').$use->name->toString();
                $references[] = new Name\FullyQualified($className, $use->name->getAttributes());
            }
        } elseif ($node instanceof FunctionLike) {
            // Inspect native declarations on their parent node: individual name
            // components of nullable, union, and intersection types may not be visited.
            foreach ($node->getParams() as $parameter) {
                $references[] = $parameter->type;
            }

            $references[] = $node->getReturnType();
        } elseif ($node instanceof Node\Stmt\Property || $node instanceof Node\Stmt\ClassConst) {
            $references[] = $node->type;
        } elseif ($node instanceof Node\Stmt\Catch_) {
            $references = $node->types;
        } elseif ($node instanceof Node\Attribute) {
            $references[] = $node->name;
        } elseif ($node instanceof StaticCall || $node instanceof StaticPropertyFetch || $node instanceof ClassConstFetch || $node instanceof New_ || $node instanceof Instanceof_) {
            if ($node->class instanceof Name) {
                $references[] = $node->class;
            } elseif ($node->class instanceof Node\Expr) {
                $receiverType = $scope->getType($node->class)->getObjectTypeOrClassStringObjectType();
            } elseif ($node instanceof New_) {
                // Anonymous models have a class declaration in place of a name.
                $receiverType = $scope->getType($node);
            }
        } elseif ($node instanceof MethodCall || $node instanceof NullsafeMethodCall || $node instanceof PropertyFetch || $node instanceof NullsafePropertyFetch || $node instanceof ArrayDimFetch) {
            $receiverType = $scope->getType($node->var);
        } elseif ($node instanceof Clone_) {
            $receiverType = $scope->getType($node->expr);
        }

        $errors = [];

        while ($references !== []) {
            $reference = array_pop($references);

            if ($reference instanceof NullableType) {
                $references[] = $reference->type;
            } elseif ($reference instanceof UnionType || $reference instanceof IntersectionType) {
                array_push($references, ...$reference->types);
            } elseif ($reference instanceof Name && $this->isModelType($scope->resolveTypeByName($reference))) {
                $errors[] = $this->modelUsageError($reference);
            }
        }

        // Inspect the operation's receiver, never the inferred type of a local
        // variable, argument, or return value being passed along.
        if ($receiverType !== null && $this->isModelType($receiverType)) {
            $errors[] = $this->modelUsageError($node);
        }

        return $errors;
    }

    private function isModelType(Type $type): bool
    {
        foreach ($type->getObjectClassReflections() as $class) {
            if ($class->is(Model::class)) {
                return true;
            }
        }

        return false;
    }

    private function modelUsageError(Node $node): RuleError
    {
        return RuleErrorBuilder::message('Controllers must obtain models or data through services and only pass them along. Move this model reference or operation into a service.')
            ->identifier('strata.controller.noModelUsage')
            ->line($node->getStartLine())
            ->build();
    }

    /** @return list<RuleError> */
    private function noEloquentQueries(Node $node, Scope $scope): array
    {
        if ((! $node instanceof StaticCall && ! $node instanceof MethodCall && ! $node instanceof NullsafeMethodCall) || ! $node->name instanceof Identifier) {
            return [];
        }

        // PHPStan also visits a synthetic MethodCall for each nullsafe call.
        if ($node->getAttribute('virtualNullsafeMethodCall', false) || $node->isFirstClassCallable()) {
            return [];
        }

        $receiver = $node instanceof StaticCall ? $node->class : $node->var;
        $receiverType = $receiver instanceof Name ? $scope->resolveTypeByName($receiver) : $scope->getType($receiver);

        if ($node instanceof StaticCall) {
            $receiverType = $receiverType->getObjectTypeOrClassStringObjectType();
        }

        $receiverType = TypeCombinator::removeNull($receiverType);
        $eloquentType = TypeCombinator::union(
            new ObjectType(Model::class),
            new ObjectType(Builder::class),
            new ObjectType(Relation::class),
        );

        if (! $eloquentType->isSuperTypeOf($receiverType)->yes()) {
            return [];
        }

        $queryType = TypeCombinator::union(
            new ObjectType(Builder::class),
            new ObjectType(Relation::class),
            new ObjectType(QueryBuilder::class),
        );
        $constructsQuery = $queryType->isSuperTypeOf(TypeCombinator::removeNull($scope->getType($node)))->yes();
        $retrievesData = false;
        $methodName = $node->name->toString();

        // Terminal reads do not share a return type: they can return models,
        // collections, paginators, scalars, or the result of a callback.
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

        if (! $constructsQuery && ! $retrievesData) {
            return [];
        }

        return [
            RuleErrorBuilder::message("Controllers must delegate Eloquent queries to services. Move this {$methodName}() call into a service.")
                ->identifier('strata.controller.noEloquentQueries')
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function noRequestValidation(Node $node, Scope $scope): array
    {
        if (! $node instanceof FuncCall && ! $node instanceof New_ && ! $node instanceof StaticCall && ! $node instanceof MethodCall && ! $node instanceof NullsafeMethodCall) {
            return [];
        }

        if ($node->getAttribute('virtualNullsafeMethodCall', false) || $node->isFirstClassCallable()) {
            return [];
        }

        if ($node instanceof FuncCall) {
            $validatesRequest = $node->name instanceof Name
                && strtolower($this->reflectionProvider->resolveFunctionName($node->name, $scope) ?? '') === 'validator';
        } elseif ($node instanceof New_) {
            $validatesRequest = (new ObjectType(Validator::class))->isSuperTypeOf($scope->getType($node))->yes();
        } else {
            if (! $node->name instanceof Identifier) {
                return [];
            }

            $receiver = $node instanceof StaticCall ? $node->class : $node->var;
            $receiverType = $receiver instanceof Name ? $scope->resolveTypeByName($receiver) : $scope->getType($receiver);

            if ($node instanceof StaticCall) {
                $receiverType = $receiverType->getObjectTypeOrClassStringObjectType();
            }

            $receiverType = TypeCombinator::removeNull($receiverType);
            $methodName = strtolower($node->name->toString());
            $validationClasses = match ($methodName) {
                'make' => [ValidationFactory::class, ValidatorFacade::class],
                'validate' => [Request::class, RequestFacade::class, ValidationFactory::class, ValidatorFacade::class, ValidatorContract::class],
                'validatewithbag' => [Request::class, RequestFacade::class, ValidatorContract::class],
                'validateresolved' => [ValidatesWhenResolved::class],
                'passes', 'fails', 'whenpasses', 'whenfails' => [ValidatorContract::class],
                // Raw validators can execute validation lazily through these methods.
                // FormRequest::validated()/safe() only expose the resolved request's input.
                'validated', 'safe', 'valid', 'invalid', 'messages', 'errors', 'getmessagebag', 'addfailure' => [ValidatorContract::class],
                default => [],
            };
            $validatesRequest = $validationClasses !== []
                && TypeCombinator::union(...array_map(fn ($class) => new ObjectType($class), $validationClasses))
                    ->isSuperTypeOf($receiverType)->yes();

            if (! $validatesRequest) {
                $validatesRequest = $this->isRequestValidationTraitMethod($receiverType, $methodName);
            }
        }

        if (! $validatesRequest) {
            return [];
        }

        return [
            RuleErrorBuilder::message("Move request validation into the action's Form Request and read validated input in the controller with validated() or safe().")
                ->identifier('strata.controller.noRequestValidation')
                ->build(),
        ];
    }

    private function isRequestValidationTraitMethod(Type $receiverType, string $methodName): bool
    {
        $classes = $receiverType->getObjectClassReflections();

        if ($classes === [] || ! $this->reflectionProvider->hasClass(ValidatesRequests::class)) {
            return false;
        }

        $trait = $this->reflectionProvider->getClass(ValidatesRequests::class)->getNativeReflection();

        foreach ($classes as $class) {
            if (! $class->hasTraitUse(ValidatesRequests::class)) {
                return false;
            }

            $reflection = $class->getNativeReflection();

            if (! $reflection->hasMethod($methodName)) {
                return false;
            }

            $method = $reflection->getMethod($methodName);
            $matchesTraitMethod = false;

            // Compare implementations to include renamed trait aliases while excluding
            // controller overrides that merely reuse a validation method's name.
            foreach (['validate', 'validateWith', 'validateWithBag'] as $validationMethodName) {
                $validationMethod = $trait->getMethod($validationMethodName);

                if ($method->getFileName() === $validationMethod->getFileName() && $method->getStartLine() === $validationMethod->getStartLine()) {
                    $matchesTraitMethod = true;

                    break;
                }
            }

            if (! $matchesTraitMethod) {
                return false;
            }
        }

        return true;
    }

    /** @return list<RuleError> */
    private function noInlineInertiaProps(Node $node, Scope $scope): array
    {
        $props = $this->getInertiaProps($node, $scope);

        if ($props === null) {
            return [];
        }

        $previousEndLine = $props->getStartLine();

        foreach ($props->items as $item) {
            if ($item === null) {
                continue;
            }

            if ($item->getStartLine() <= $previousEndLine
                || $item->getStartLine() !== $item->getEndLine()
                || $item->getEndLine() >= $props->getEndLine()) {
                return [
                    RuleErrorBuilder::message('Put each Inertia prop on its own line between the opening and closing array brackets, with the closing bracket on its own line.')
                        ->identifier('strata.controller.noInlineInertiaProps')
                        ->line($item->getStartLine())
                        ->build(),
                ];
            }

            $previousEndLine = $item->getEndLine();
        }

        return [];
    }

    /** @return list<RuleError> */
    private function noNonVariableInertiaProps(Node $node, Scope $scope): array
    {
        $props = $this->getInertiaProps($node, $scope);

        if ($props === null) {
            return [];
        }

        $errors = [];

        foreach ($props->items as $item) {
            // A spread is not an individual prop, and its contents are not inspected.
            if ($item === null || $item->unpack) {
                continue;
            }

            if ($item->value instanceof Variable && is_string($item->value->name)) {
                continue;
            }

            $errors[] = RuleErrorBuilder::message('Inertia prop values in controllers must be plain named variables. Assign this value to a variable before rendering the Inertia response.')
                ->identifier('strata.controller.noNonVariableInertiaProps')
                ->line($item->value->getStartLine())
                ->build();
        }

        return $errors;
    }

    /** @return list<RuleError> */
    private function noMismatchedInertiaPropNames(Node $node, Scope $scope): array
    {
        $props = $this->getInertiaProps($node, $scope);

        if ($props === null) {
            return [];
        }

        $errors = [];

        foreach ($props->items as $item) {
            if ($item === null || $item->unpack || ! $item->key instanceof String_) {
                continue;
            }

            if (! $item->value instanceof Variable || ! is_string($item->value->name)) {
                continue;
            }

            $propName = $item->key->value;

            if ($propName === $item->value->name) {
                continue;
            }

            $errors[] = RuleErrorBuilder::message("Inertia prop \"{$propName}\" must use the matching local variable \${$propName}. Rename or assign to \${$propName} before rendering, preserving the prop key because it is the frontend contract.")
                ->identifier('strata.controller.noMismatchedInertiaPropNames')
                ->line($item->value->getStartLine())
                ->build();
        }

        return $errors;
    }

    /** @return list<RuleError> */
    private function noRouteModelBinding(Node $node, Scope $scope): array
    {
        if (! $node instanceof ClassMethod || ! $node->isPublic() || ($node->isMagic() && $node->name->toLowerString() !== '__invoke')) {
            return [];
        }

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
                    $errors[] = RuleErrorBuilder::message("Controller action parameter \${$parameter->var->name} must receive a scalar route identifier. Move the Eloquent model lookup to a service.")
                        ->identifier('strata.controller.noRouteModelBinding')
                        ->line($parameter->getStartLine())
                        ->build();

                    break;
                }
            }
        }

        return $errors;
    }

    /** @return list<RuleError> */
    private function allowedReturnTypes(Node $node): array
    {
        // PHPStan emits this summary only for methods with bodies, and excludes
        // returns belonging to nested functions or callbacks.
        if (! $node instanceof MethodReturnStatementsNode) {
            return [];
        }

        $method = $node->getMethodReflection();

        if (! $method->isPublic() || $method->isAbstract()->yes() || $method->isConstructor() || in_array(strtolower($method->getName()), [
            '__construct', '__destruct', '__call', '__callstatic', '__get', '__set',
            '__isset', '__unset', '__sleep', '__wakeup', '__tostring', '__set_state',
            '__clone', '__debuginfo', '__serialize', '__unserialize',
        ], true)) {
            return [];
        }

        $error = static fn (string $reason, int $line): RuleError => RuleErrorBuilder::message($reason.' Controller actions must return Symfony\Component\HttpFoundation\Response, Inertia\Response, or Illuminate\Http\Resources\Json\JsonResource (including subclasses and resource collections). Wrap data in an approved response or resource.')
            ->identifier('strata.controller.allowedReturnTypes')
            ->line($line)
            ->build();

        // Even an unreachable yield makes the action a generator. Scan its own
        // body without entering nested functions, closures, or classes.
        $nodes = $node->getStatements();

        while ($nodes !== []) {
            $current = array_pop($nodes);

            if ($current instanceof FunctionLike || $current instanceof Node\Stmt\ClassLike) {
                continue;
            }

            if ($current instanceof Node\Expr\Yield_ || $current instanceof Node\Expr\YieldFrom) {
                return [$error('This action returns a Generator.', $current->getStartLine())];
            }

            foreach ($current->getSubNodeNames() as $name) {
                $children = $current->{$name};

                if ($children instanceof Node) {
                    $nodes[] = $children;
                } elseif (is_array($children)) {
                    foreach ($children as $child) {
                        if ($child instanceof Node) {
                            $nodes[] = $child;
                        }
                    }
                }
            }
        }

        $allowedType = TypeCombinator::union(
            new ObjectType(SymfonyResponse::class),
            new ObjectType(InertiaResponse::class),
            new ObjectType(JsonResource::class),
        );
        $errors = [];

        foreach ($node->getReturnStatements() as $returnStatement) {
            $return = $returnStatement->getReturnNode();

            if ($return->expr === null) {
                $errors[] = $error('An empty return produces no response.', $return->getStartLine());

                continue;
            }

            $returnType = $returnStatement->getScope()->getType($return->expr);

            // A definite subtype includes every union member; mixed and unknown
            // types fail, while never-returning expressions produce no value.
            if (! $allowedType->isSuperTypeOf($returnType)->yes()) {
                $errors[] = $error('Returned type: '.$returnType->describe(VerbosityLevel::typeOnly()).'.', $return->getStartLine());
            }
        }

        if (! $node->getStatementResult()->isAlwaysTerminating()) {
            $errors[] = $error('This action can finish without returning a response.', $node->getEndLine());
        }

        return $errors;
    }

    /** @return list<RuleError> */
    private function noArithmeticOperations(Node $node, Scope $scope): array
    {
        if ($node instanceof Node\Expr\UnaryMinus || $node instanceof Node\Expr\UnaryPlus) {
            // A sign on a numeric literal is fixed data, not a calculation.
            if ($node->expr instanceof Node\Scalar\Int_ || $node->expr instanceof Node\Scalar\Float_) {
                return [];
            }
        } elseif ($node instanceof Node\Expr\BinaryOp\Plus) {
            // Only exempt array union when both operands are definitely arrays.
            if ($scope->getType($node->left)->isArray()->yes() && $scope->getType($node->right)->isArray()->yes()) {
                return [];
            }
        } elseif ($node instanceof Node\Expr\AssignOp\Plus) {
            if ($scope->getType($node->var)->isArray()->yes() && $scope->getType($node->expr)->isArray()->yes()) {
                return [];
            }
        } elseif (! $node instanceof Node\Expr\BinaryOp\Minus
            && ! $node instanceof Node\Expr\BinaryOp\Mul
            && ! $node instanceof Node\Expr\BinaryOp\Div
            && ! $node instanceof Node\Expr\BinaryOp\Mod
            && ! $node instanceof Node\Expr\BinaryOp\Pow
            && ! $node instanceof Node\Expr\AssignOp\Minus
            && ! $node instanceof Node\Expr\AssignOp\Mul
            && ! $node instanceof Node\Expr\AssignOp\Div
            && ! $node instanceof Node\Expr\AssignOp\Mod
            && ! $node instanceof Node\Expr\AssignOp\Pow
            && ! $node instanceof Node\Expr\PreInc
            && ! $node instanceof Node\Expr\PostInc
            && ! $node instanceof Node\Expr\PreDec
            && ! $node instanceof Node\Expr\PostDec) {
            return [];
        }

        return [
            RuleErrorBuilder::message('Controllers must delegate arithmetic operations. Move this calculation into a service or helper.')
                ->identifier('strata.controller.noArithmeticOperations')
                ->line($node->getStartLine())
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function noLoopStatements(Node $node): array
    {
        if (! $node instanceof Node\Stmt\For_
            && ! $node instanceof Node\Stmt\Foreach_
            && ! $node instanceof Node\Stmt\While_
            && ! $node instanceof Node\Stmt\Do_) {
            return [];
        }

        return [
            RuleErrorBuilder::message('Controllers must delegate iteration to a service or helper. Move this loop there and call a single service operation from the controller.')
                ->identifier('strata.controller.noLoopStatements')
                ->line($node->getStartLine())
                ->build(),
        ];
    }

    /** @return list<RuleError> */
    private function noPositionalArguments(Node $node): array
    {
        if (! $node instanceof MethodCall && ! $node instanceof StaticCall && ! $node instanceof NullsafeMethodCall) {
            return [];
        }

        if ($node->getAttribute('virtualNullsafeMethodCall', false) || $node->isFirstClassCallable()) {
            return [];
        }

        $errors = [];

        foreach ($node->getRawArgs() as $argument) {
            if (! $argument instanceof Node\Arg || (! $argument->unpack && $argument->name !== null)) {
                continue;
            }

            $message = $argument->unpack
                ? 'Method calls in controllers must use explicit named arguments. Replace argument unpacking with arguments named at the call site.'
                : 'Method calls in controllers must use named arguments. Replace this positional argument with a named argument using the actual declared parameter name.';

            $errors[] = RuleErrorBuilder::message($message)
                ->identifier('strata.controller.noPositionalArguments')
                ->line($argument->getStartLine())
                ->build();
        }

        return $errors;
    }

    private function getInertiaProps(Node $node, Scope $scope): ?Array_
    {
        if (! $node instanceof FuncCall && ! $node instanceof StaticCall && ! $node instanceof MethodCall && ! $node instanceof NullsafeMethodCall) {
            return null;
        }

        if ($node->getAttribute('virtualNullsafeMethodCall', false) || $node->isFirstClassCallable()) {
            return null;
        }

        if ($node instanceof FuncCall) {
            if (! $node->name instanceof Name || strtolower($this->reflectionProvider->resolveFunctionName($node->name, $scope) ?? '') !== 'inertia') {
                return null;
            }
        } else {
            if (! $node->name instanceof Identifier || strtolower($node->name->toString()) !== 'render') {
                return null;
            }

            $receiver = $node instanceof StaticCall ? $node->class : $node->var;
            $receiverType = $receiver instanceof Name ? $scope->resolveTypeByName($receiver) : $scope->getType($receiver);

            if ($node instanceof StaticCall) {
                $receiverType = $receiverType->getObjectTypeOrClassStringObjectType();
            }

            $inertiaType = new ObjectType($node instanceof StaticCall ? Inertia::class : ResponseFactory::class);

            if (! $inertiaType->isSuperTypeOf(TypeCombinator::removeNull($receiverType))->yes()) {
                return null;
            }
        }

        $props = null;
        $hasUnpackedArguments = false;

        foreach ($node->getArgs() as $position => $argument) {
            if ($argument->unpack) {
                $hasUnpackedArguments = true;

                continue;
            }

            if ($argument->name?->toString() === 'props' || ($argument->name === null && $position === 1 && ! $hasUnpackedArguments)) {
                $props = $argument->value;

                break;
            }
        }

        // Only inspect explicit arrays; do not trace props supplied through variables.
        return $props instanceof Array_ ? $props : null;
    }
}
