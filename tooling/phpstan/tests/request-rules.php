<?php

// Run with STRATA_TEST_PROJECT pointing to a Laravel project with PHPStan installed.
$project = getenv('STRATA_TEST_PROJECT');

if ($project === false || ! is_file($project.'/vendor/bin/phpstan')) {
    throw new RuntimeException('Set STRATA_TEST_PROJECT to a Laravel project with PHPStan installed.');
}

$directory = realpath(sys_get_temp_dir()).'/strata-request-rules-'.bin2hex(random_bytes(6));
mkdir($directory);
$fixtures = [];

function requestSource(string $namespace, string $class, string $error = '', string $parent = '\\Illuminate\\Foundation\\Http\\FormRequest'): string
{
    $marker = $error !== '' ? ' // error:'.$error : '';

    return "<?php\nnamespace {$namespace};\n\nclass {$class} extends {$parent}{$marker}\n{\n}\n";
}

foreach ([['User', 'StoreUserRequest'], ['User', 'UpdateUserRequest'], ['ImageFile', 'StoreImageFileRequest'], ['Unused', 'ReviewUnusedRequest'], ['Users', 'StoreUsersRequest']] as [$module, $class]) {
    $fixtures['app/Http/Requests/'.$module.'/'.$class.'.php'] = requestSource('App\\Http\\Requests\\'.$module, $class);
}

$fixtures['app/Http/Requests/Derived/StoreDerivedRequest.php'] = requestSource('App\\Http\\Requests\\Derived', 'StoreDerivedRequest', '', '\\App\\Http\\Requests\\User\\StoreUserRequest');
$fixtures['app/Http/Requests/User/UserStoreRequest.php'] = requestSource('App\\Http\\Requests\\User', 'UserStoreRequest', 'enforceActionFirstName');
$fixtures['app/Http/Requests/User/UserRequest.php'] = requestSource('App\\Http\\Requests\\User', 'UserRequest', 'enforceActionFirstName');
$fixtures['app/Http/Requests/User/lowercaseUserRequest.php'] = requestSource('App\\Http\\Requests\\User', 'lowercaseUserRequest', 'enforceActionFirstName');
$fixtures['app/Http/Requests/User/SaveUserRequest.php'] = requestSource('App\\Http\\Requests\\User', 'PersistUserRequest', 'enforceActionFirstName');
$fixtures['app/Http/Requests/User/DeleteUserRequest.php'] = requestSource('App\\Http\\Requests\\User', 'DeleteUser', 'enforceActionFirstName');
$fixtures['app/Http/Requests/ImageFile/ImageFileStoreRequest.php'] = requestSource('App\\Http\\Requests\\ImageFile', 'ImageFileStoreRequest', 'enforceActionFirstName');
$fixtures['app/Http/Requests/StoreNodeRequest.php'] = requestSource('App\\Http\\Requests', 'StoreNodeRequest', 'enforceModuleDirectory');
$fixtures['app/Http/Requests/User/Admin/ArchiveUserRequest.php'] = requestSource('App\\Http\\Requests\\User\\Admin', 'ArchiveUserRequest', 'enforceModuleDirectory');
$fixtures['app/Http/Requests/lowercase/StoreLowercaseRequest.php'] = requestSource('App\\Http\\Requests\\lowercase', 'StoreLowercaseRequest', 'enforceModuleDirectory');
$fixtures['app/Elsewhere/StoreMisplacedRequest.php'] = requestSource('App\\Elsewhere', 'StoreMisplacedRequest', 'enforceModuleDirectory');
$fixtures['app/Http/Requests/Namespace/StoreNamespaceRequest.php'] = requestSource('App\\Http\\Requests\\Wrong', 'StoreNamespaceRequest', 'enforceModuleDirectory');
$fixtures['app/Http/Requests/Combined/Wrong.php'] = requestSource('App\\Wrong', 'Wrong', 'enforceModuleDirectory,enforceActionFirstName');

$fixtures['app/Http/Controllers/UserController.php'] = <<<'PHP'
<?php
namespace App\Http\Controllers;

use App\Http\Requests\User\StoreUserRequest as Store;
use App\Http\Requests\User\UpdateUserRequest;
use App\Http\Requests\ImageFile\StoreImageFileRequest as ImageFileRequest;

class UserController
{
    public function store(Store $request): void {}
    public function update(?UpdateUserRequest $request): void {}
    public function either(Store|UpdateUserRequest|null $request): void {}
    public function ordinary(\Illuminate\Http\Request $request): void {}
    public function generic(\Illuminate\Foundation\Http\FormRequest $request): void {}
    public function unknown(\UnknownRequest $request): void {}
    public function misplaced(\App\Elsewhere\StoreMisplacedRequest $request): void {} // error:enforceControllerModule
    public function plural(\App\Http\Requests\Users\StoreUsersRequest $request): void {} // error:enforceControllerModule
    public function root(\App\Http\Requests\StoreNodeRequest $request): void {} // error:enforceControllerModule
    public function image(ImageFileRequest $request): void {} // error:enforceControllerModule
    public function nullable(?ImageFileRequest $request): void {} // error:enforceControllerModule
    public function union(Store|ImageFileRequest|null $request): void {} // error:enforceControllerModule
    public function intersection(ImageFileRequest&\App\Marker $request): void {} // error:enforceControllerModule
    public function dnf((ImageFileRequest&\App\Marker)|Store $request): void {} // error:enforceControllerModule
}
PHP;

$fixtures['app/Http/Controllers/Admin/ImageFileController.php'] = <<<'PHP'
<?php
namespace App\Http\Controllers\Admin;

class ImageFileController extends \Illuminate\Routing\Controller
{
    public function store(\App\Http\Requests\ImageFile\StoreImageFileRequest $request): void {}
    public function wrong(\App\Http\Requests\User\StoreUserRequest $request): void {} // error:enforceControllerModule
}
PHP;

$fixtures['app/Http/Controllers/Controller.php'] = <<<'PHP'
<?php
namespace App\Http\Controllers;

abstract class Controller
{
    protected function shared(\App\Http\Requests\User\StoreUserRequest $request): void {}
}
PHP;

$fixtures['app/Http/Controllers/DerivedController.php'] = <<<'PHP'
<?php
namespace App\Http\Controllers;

class DerivedController extends Controller
{
    public function store(\App\Http\Requests\Derived\StoreDerivedRequest $request): void {}
}
PHP;

$fixtures['app/Http/Controllers/NamespaceController.php'] = <<<'PHP'
<?php
namespace App\Http\Controllers;

class NamespaceController
{
    public function store(\App\Http\Requests\Wrong\StoreNamespaceRequest $request): void {} // error:enforceControllerModule
}
PHP;

$fixtures['app/Services/ExternalUserController.php'] = <<<'PHP'
<?php
namespace App\Services;

class ExternalUserController extends \Illuminate\Routing\Controller
{
    public function store(\App\Http\Requests\User\StoreUserRequest $request): void {} // error:enforceControllerModule
}
PHP;

$fixtures['app/Services/IgnoredController.php'] = <<<'PHP'
<?php
namespace App\Services;

class IgnoredController
{
    public function store(\App\Http\Requests\User\StoreUserRequest $request): void {}
}
PHP;

$fixtures['app/Http/Requests/OrdinaryRequest.php'] = <<<'PHP'
<?php
namespace App\Http\Requests;

class OrdinaryRequest extends \Illuminate\Http\Request {}
PHP;

$fixtures['app/Support.php'] = <<<'PHP'
<?php
namespace App;

interface Marker {}
$request = new class extends \Illuminate\Foundation\Http\FormRequest {};
PHP;

function runPhpStan(array $command, string $directory): array
{
    $process = proc_open($command, [1 => ['pipe', 'w'], 2 => ['file', $directory.'/stderr.log', 'w']], $pipes, $directory);

    if (! is_resource($process)) {
        throw new RuntimeException('Unable to run PHPStan.');
    }

    $output = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $exit = proc_close($process);

    if (! in_array($exit, [0, 1], true) || $output === false) {
        throw new RuntimeException('PHPStan failed: '.$output.file_get_contents($directory.'/stderr.log'));
    }

    return json_decode($output, true, flags: JSON_THROW_ON_ERROR);
}

try {
    $expected = [];

    foreach ($fixtures as $path => $source) {
        $file = $directory.'/'.$path;

        if (! is_dir(dirname($file))) {
            mkdir(dirname($file), recursive: true);
        }

        file_put_contents($file, $source);
        $expected[$path] = [];

        foreach (explode("\n", $source) as $index => $line) {
            if (preg_match('/\/\/ error:([A-Za-z,]+)/', $line, $matches)) {
                foreach (explode(',', $matches[1]) as $identifier) {
                    $expected[$path][] = [$index + 1, 'strata.request.'.$identifier];
                }
            }
        }
    }

    $autoload = realpath($project.'/vendor/autoload.php');
    $bootstrap = realpath(__DIR__.'/../phpstan.neon.php');
    file_put_contents($directory.'/bootstrap.php', '<?php require '.var_export($autoload, true).'; require '.var_export($bootstrap, true).';');
    file_put_contents($directory.'/phpstan.neon', <<<'NEON'
parameters:
    customRulesetUsed: true
    tmpDir: cache
    paths:
        - app
    parallel:
        maximumNumberOfProcesses: 0
rules:
    - Strata\PHPStan\RequestRules
NEON);

    $output = runPhpStan([PHP_BINARY, $project.'/vendor/bin/phpstan', 'analyse', '-c', $directory.'/phpstan.neon', '-a', $directory.'/bootstrap.php', '--error-format=json', '--no-progress', '-v', '--memory-limit=512M'], $directory);

    if (isset($output['tool'])) {
        if (($output['truncated'] ?? false) || ! isset($output['error_details'])) {
            throw new RuntimeException('Incomplete PHPStan output: '.json_encode($output));
        }

        $files = array_map(static fn (array $messages): array => ['messages' => $messages], $output['error_details']);
    } else {
        if (($output['errors'] ?? []) !== []) {
            throw new RuntimeException('PHPStan errors: '.json_encode($output['errors']));
        }

        $files = $output['files'];
    }

    $actual = array_fill_keys(array_keys($expected), []);

    foreach ($files as $path => $result) {
        $relative = substr(realpath($path) ?: $path, strlen($directory) + 1);

        if (! array_key_exists($relative, $actual)) {
            throw new RuntimeException('Unexpected diagnostic file: '.$path);
        }

        foreach ($result['messages'] as $message) {
            $actual[$relative][] = [$message['line'], $message['identifier'] ?? ''];

            if (! str_contains($message['message'], 'Request')) {
                throw new RuntimeException('Missing actionable request guidance: '.$message['message']);
            }
        }
    }

    foreach ($expected as $path => $errors) {
        sort($errors);
        sort($actual[$path]);

        if ($errors !== $actual[$path]) {
            throw new RuntimeException($path."\nExpected: ".json_encode($errors)."\nActual: ".json_encode($actual[$path]));
        }
    }

    echo count($fixtures)." request-rule fixtures passed through PHPStan.\n";
} finally {
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);

    foreach ($files as $file) {
        $file->isDir() ? rmdir($file->getPathname()) : unlink($file->getPathname());
    }

    rmdir($directory);
}
