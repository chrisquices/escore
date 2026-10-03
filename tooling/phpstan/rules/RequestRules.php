<?php

namespace Strata\PHPStan;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Routing\Controller;
use PhpParser\Node;
use PhpParser\Node\IntersectionType;
use PhpParser\Node\Name;
use PhpParser\Node\NullableType;
use PhpParser\Node\Stmt\Class_;
use PhpParser\Node\Stmt\ClassMethod;
use PhpParser\Node\UnionType;
use PHPStan\Analyser\Scope;
use PHPStan\Node\InClassNode;
use PHPStan\Rules\Rule;
use PHPStan\Rules\RuleError;
use PHPStan\Rules\RuleErrorBuilder;

/** @implements Rule<InClassNode> */
class RequestRules implements Rule
{
    public function getNodeType(): string
    {
        return InClassNode::class;
    }

    /** @return list<RuleError> */
    public function processNode(Node $node, Scope $scope): array
    {
        $class = $node->getClassReflection();
        $declaration = $node->getOriginalNode();

        if (! $declaration instanceof Class_ || $declaration->name === null || $class->isAnonymous()) {
            return [];
        }

        if ($class->isSubclassOf(FormRequest::class)) {
            $module = $this->requestModule($scope->getFile());

            return [
                ...$this->enforceModuleDirectory($node, $scope, $module),
                ...($module !== null ? $this->enforceActionFirstName($node, $scope, $module, $declaration->name->toString()) : []),
            ];
        }

        $errors = [];

        foreach ($declaration->getMethods() as $method) {
            array_push($errors, ...$this->enforceControllerModule($method, $scope));
        }

        return $errors;
    }

    private function requestModule(string $file): ?string
    {
        $root = getcwd();

        if ($root === false) {
            return null;
        }

        $prefix = rtrim(str_replace('\\', '/', realpath($root) ?: $root), '/').'/app/Http/Requests/';
        $file = str_replace('\\', '/', realpath($file) ?: $file);

        if (! str_starts_with($file, $prefix)) {
            return null;
        }

        $parts = explode('/', substr($file, strlen($prefix)));

        return count($parts) === 2 && preg_match('/^[A-Z][A-Za-z0-9]*$/D', $parts[0]) === 1 ? $parts[0] : null;
    }

    /** @return list<RuleError> */
    private function enforceModuleDirectory(InClassNode $node, Scope $scope, ?string $module): array
    {
        if ($module === null) {
            return [$this->error($node, __FUNCTION__, 'Place Form Requests directly in app/Http/Requests/<Module>/, using a singular module folder matching the controller name without Controller. For example, UserController uses app/Http/Requests/User/StoreUserRequest.php. Do not place requests directly in Requests/ or in deeper subfolders.')];
        }

        $namespace = 'App\\Http\\Requests\\'.$module;

        if ($scope->getNamespace() !== $namespace) {
            return [$this->error($node, __FUNCTION__, sprintf('The request namespace must be %s to match its app/Http/Requests/%s/ folder.', $namespace, $module))];
        }

        return [];
    }

    /** @return list<RuleError> */
    private function enforceActionFirstName(InClassNode $node, Scope $scope, string $module, string $className): array
    {
        $fileName = basename(str_replace('\\', '/', $scope->getFile()));

        if ($fileName === $className.'.php'
            && preg_match('/^[A-Z][A-Za-z0-9]*'.preg_quote($module, '/').'Request$/D', $className) === 1) {
            return [];
        }

        return [$this->error($node, __FUNCTION__, sprintf('Name this Form Request <Action>%sRequest and save it as <Action>%sRequest.php, for example Store%sRequest.php. Put a nonempty PascalCase action before the exact module name %s, followed by Request. The class name must exactly match the filename.', $module, $module, $module, $module))];
    }

    /** @return list<RuleError> */
    private function enforceControllerModule(ClassMethod $node, Scope $scope): array
    {
        $controller = $scope->getClassReflection();

        if ($controller === null || $controller->isAnonymous()) {
            return [];
        }

        $namespace = $scope->getNamespace() ?? '';
        $file = str_replace('\\', '/', $scope->getFile());

        if ($namespace !== 'App\\Http\\Controllers' && ! str_starts_with($namespace, 'App\\Http\\Controllers\\')
            && ! str_contains($file, '/app/Http/Controllers/')
            && ! $controller->is('App\\Http\\Controllers\\Controller') && ! $controller->is(Controller::class)) {
            return [];
        }

        $controllerName = basename(str_replace('\\', '/', $controller->getName()));

        if ($controllerName === 'Controller' || ! str_ends_with($controllerName, 'Controller')) {
            return [];
        }

        $module = substr($controllerName, 0, -strlen('Controller'));
        $expectedNamespace = 'App\\Http\\Requests\\'.$module;
        $errors = [];

        foreach ($node->params as $parameter) {
            $types = [$parameter->type];
            $checked = [];

            while ($types !== []) {
                $type = array_pop($types);

                if ($type instanceof NullableType) {
                    $types[] = $type->type;
                } elseif ($type instanceof UnionType || $type instanceof IntersectionType) {
                    array_push($types, ...$type->types);
                } elseif ($type instanceof Name) {
                    foreach ($scope->resolveTypeByName($type)->getObjectClassReflections() as $request) {
                        if (! $request->isSubclassOf(FormRequest::class) || isset($checked[$request->getName()])) {
                            continue;
                        }

                        $checked[$request->getName()] = true;
                        $requestFile = $request->getFileName();
                        $separator = strrpos($request->getName(), '\\');
                        $requestNamespace = $separator === false ? '' : substr($request->getName(), 0, $separator);

                        if ($requestFile !== null && $this->requestModule($requestFile) === $module && $requestNamespace === $expectedNamespace) {
                            continue;
                        }

                        $errors[] = $this->error($parameter, __FUNCTION__, sprintf('Form Request %s used by %s must belong to module %s. Place it in app/Http/Requests/%s/ with namespace %s and an <Action>%sRequest class and matching filename.', $request->getName(), $controllerName, $module, $module, $expectedNamespace, $module));
                    }
                }
            }
        }

        return $errors;
    }

    private function error(Node $node, string $method, string $message): RuleError
    {
        return RuleErrorBuilder::message($message)
            ->identifier('strata.request.'.$method)
            ->line($node->getStartLine())
            ->build();
    }
}
