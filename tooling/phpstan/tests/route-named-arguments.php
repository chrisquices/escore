<?php

// Run with STRATA_TEST_PROJECT pointing to a Laravel project with PHPStan installed.
$project = getenv('STRATA_TEST_PROJECT');

if ($project === false || ! is_file($project.'/vendor/bin/phpstan')) {
    throw new RuntimeException('Set STRATA_TEST_PROJECT to a Laravel project with PHPStan installed.');
}

$directory = realpath(sys_get_temp_dir()).'/strata-route-named-arguments-'.bin2hex(random_bytes(6));
mkdir($directory);
mkdir($directory.'/routes');
mkdir($directory.'/outside');

$header = <<<'PHP'
<?php
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Route as Routes;
use Illuminate\Routing\Router;
use Illuminate\Routing\RouteRegistrar;
use Illuminate\Routing\Route as RouteInstance;
use Fixtures\NodeController;
use Fixtures\FakeRouter;

PHP;

$cases = [
    'positional' => "Route::get('/', [NodeController::class, 'index'])->name('index');",
    'named' => "Route::get(uri: '/', action: [NodeController::class, 'index'])->name(name: 'index'); // errors:3",
    'mixed' => "Route::get('/', action: [NodeController::class, 'index'])->name('index'); // errors:1",
    'reordered' => "Route::get(action: [NodeController::class, 'index'], uri: '/'); // errors:2",
    'multiline' => <<<'PHP'
Route::get(
    uri: '/', // errors:1
    action: [NodeController::class, 'index'], // errors:1
)->name(
    name: 'index', // errors:1
);
PHP,
    'group-attributes' => <<<'PHP'
// Nodes
Route::prefix(prefix: 'nodes')->name(value: 'nodes.')->whereUuid(parameters: 'uid')->group(callback: function (): void { // errors:4
    Route::get(uri: '/', action: [NodeController::class, 'index'])->name(name: 'index'); // errors:3
});
PHP,
    'group-array' => <<<'PHP'
// Nodes
Route::group(attributes: ['prefix' => 'nodes', 'as' => 'nodes.'], routes: function (): void {}); // errors:2
PHP,
    'positional-group' => <<<'PHP'
// Auth
Route::middleware(['auth', 'verified'])->group(function (): void {
    // Nodes
    Route::prefix('nodes')->name('nodes.')->whereUuid('uid')->group(function (): void {
        Route::get('/', [NodeController::class, 'index'])->name('index');
    });
});
PHP,
    'alias' => "Routes::post(uri: '/', action: [NodeController::class, 'index']); // errors:2",
    'fully-qualified' => "\\Illuminate\\Support\\Facades\\Route::get(uri: '/', action: [NodeController::class, 'index']); // errors:2",
    'router' => <<<'PHP'
$configure = function (Router $router): void {
    $router->get(uri: '/', action: [NodeController::class, 'index'])->name(name: 'index'); // errors:3
};
PHP,
    'registrar' => <<<'PHP'
$configure = function (RouteRegistrar $registrar): void {
    $registrar->prefix(value: 'nodes')->get(uri: '/', action: [NodeController::class, 'index'])->name(name: 'index'); // errors:4
};
PHP,
    'route-instance' => <<<'PHP'
$configure = function (RouteInstance $route): void {
    $route->name(name: 'index')->whereUuid(parameters: 'uid')->middleware(middleware: 'auth'); // errors:3
};
PHP,
    'nullable' => <<<'PHP'
$configure = function (?RouteInstance $route): void {
    $route?->name(name: 'index'); // errors:1
};
PHP,
    'nullable-router' => <<<'PHP'
$configure = function (?Router $router): void {
    $router?->get(uri: '/', action: [NodeController::class, 'index']); // errors:2
};
PHP,
    'dynamic-method' => <<<'PHP'
$method = 'get';
Route::$method(uri: '/', action: [NodeController::class, 'index']); // errors:2
PHP,
    'dynamic-class' => <<<'PHP'
$routeClass = Route::class;
$routeClass::get(uri: '/', action: [NodeController::class, 'index']); // errors:2
PHP,
    'resource-modifiers' => "Route::resource('nodes', NodeController::class)->names(names: ['index' => 'nodes.index']); // errors:1",
    'singleton-modifiers' => "Route::singleton('node', NodeController::class)->name(method: 'show', name: 'node.show'); // errors:2",
    'unrelated' => <<<'PHP'
FakeRouter::get(uri: '/', action: [NodeController::class, 'index'])->name(name: 'index');
$router = new FakeRouter;
$router->name(name: 'index');
sprintf(format: '%s', values: 'nodes');
PHP,
    'callback-and-argument' => <<<'PHP'
Route::get(FakeRouter::uri(value: '/'), [NodeController::class, 'index'])->name('index');
Route::get('/', function (): void {
    FakeRouter::get(uri: '/', action: [NodeController::class, 'index']);
})->name('index');
PHP,
    'chain-leaves-routing' => "Route::get('/', [NodeController::class, 'index'])->getActionName()->unrelated(name: 'index');",
    'first-class-callable' => '$callable = Route::get(...);',
    'positional-unpacking' => "Route::get(...['/', [NodeController::class, 'index']]);",
    'outside/ignored' => "Route::get(uri: '/', action: [NodeController::class, 'index'])->name(name: 'index');",
];

try {
    $expected = [];

    foreach ($cases as $name => $source) {
        $path = (str_starts_with($name, 'outside/') ? $name : 'routes/'.$name).'.php';
        $source = $header.$source."\n";
        file_put_contents($directory.'/'.$path, $source);
        $expected[$path] = [];

        foreach (explode("\n", $source) as $index => $line) {
            if (preg_match('/\/\/ errors:(\d+)/', $line, $matches)) {
                array_push($expected[$path], ...array_fill(0, (int) $matches[1], $index + 1));
            }
        }
    }

    file_put_contents($directory.'/Support.php', <<<'PHP'
<?php
namespace Fixtures;

class NodeController { public function index(): void {} }
class FakeRouter
{
    public static function get(string $uri, array $action): self { return new self; }
    public function name(string $name): self { return $this; }
    public static function uri(string $value): string { return $value; }
}
PHP);
    $autoload = realpath($project.'/vendor/autoload.php');
    $bootstrap = realpath(__DIR__.'/../phpstan.neon.php');
    file_put_contents($directory.'/bootstrap.php', '<?php require '.var_export($autoload, true).'; require '.var_export($bootstrap, true).';');
    file_put_contents($directory.'/phpstan.neon', <<<'NEON'
parameters:
    customRulesetUsed: true
    tmpDir: cache
    paths:
        - routes
        - outside
    scanFiles:
        - Support.php
    parallel:
        maximumNumberOfProcesses: 0
rules:
    - Strata\PHPStan\RouteRules
NEON);
    $process = proc_open([PHP_BINARY, $project.'/vendor/bin/phpstan', 'analyse', '-c', $directory.'/phpstan.neon', '-a', $directory.'/bootstrap.php', '--error-format=json', '--no-progress', '-v', '--memory-limit=512M'], [1 => ['pipe', 'w'], 2 => ['file', $directory.'/stderr.log', 'w']], $pipes, $directory);

    if (! is_resource($process)) {
        throw new RuntimeException('Unable to run PHPStan.');
    }

    $output = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $exit = proc_close($process);

    if (! in_array($exit, [0, 1], true) || $output === false) {
        throw new RuntimeException('PHPStan failed: '.$output.file_get_contents($directory.'/stderr.log'));
    }

    $output = json_decode($output, true, flags: JSON_THROW_ON_ERROR);

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

        foreach ($result['messages'] as $message) {
            $identifier = $message['identifier'] ?? '';

            if (! str_starts_with($identifier, 'strata.route.')) {
                throw new RuntimeException('Unexpected PHPStan diagnostic: '.json_encode($message));
            }

            if ($identifier !== 'strata.route.noNamedArguments') {
                continue;
            }

            $actual[$relative][] = $message['line'];

            if (! str_contains($message['message'], 'positional arguments') || ! str_contains($message['message'], 'declared parameter order')) {
                throw new RuntimeException('Missing actionable argument guidance: '.$message['message']);
            }
        }
    }

    foreach ($expected as $path => $lines) {
        sort($lines);
        sort($actual[$path]);

        if ($lines !== $actual[$path]) {
            throw new RuntimeException($path."\nExpected: ".json_encode($lines)."\nActual: ".json_encode($actual[$path]));
        }
    }

    echo count($cases)." route named-argument fixtures passed through PHPStan.\n";
} finally {
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);

    foreach ($files as $file) {
        $file->isDir() ? rmdir($file->getPathname()) : unlink($file->getPathname());
    }

    rmdir($directory);
}
