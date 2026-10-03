<?php

// Run with STRATA_TEST_PROJECT pointing to a Laravel project with PHPStan installed.
$project = getenv('STRATA_TEST_PROJECT');

if ($project === false || ! is_file($project.'/vendor/bin/phpstan')) {
    throw new RuntimeException('Set STRATA_TEST_PROJECT to a Laravel project with PHPStan installed.');
}

$directory = realpath(sys_get_temp_dir()).'/strata-authenticated-user-variables-'.bin2hex(random_bytes(6));
mkdir($directory);
mkdir($directory.'/cases');

$retrievals = [
    'facade-user' => ['Auth::user()', 'user'],
    'facade-id' => ['Auth::id()', 'userId'],
    'facade-alias' => ['Authentication::user()', 'user'],
    'fully-qualified' => ['\\Illuminate\\Support\\Facades\\Auth::id()', 'userId'],
    'global-facade' => ['\\Auth::user()', 'user'],
    'helper-user' => ['auth()->user()', 'user'],
    'helper-id' => ['auth()->id()', 'userId'],
    'named-helper-guard-user' => ["auth('web')->user()", 'user'],
    'named-helper-guard-id' => ["auth('web')->id()", 'userId'],
    'facade-guard-user' => ["Auth::guard('web')->user()", 'user'],
    'facade-guard-id' => ["Auth::guard('web')->id()", 'userId'],
    'request-user' => ['$request->user()', 'user'],
    'named-request-guard' => ["\$request->user('web')", 'user'],
    'form-request-user' => ['$formRequest->user()', 'user'],
    'request-helper-user' => ['request()->user()', 'user'],
    'request-facade-user' => ['RequestFacade::user()', 'user'],
    'injected-guard-user' => ['$guard->user()', 'user'],
    'injected-guard-id' => ['$guard->id()', 'userId'],
    'injected-manager-user' => ['$manager->user()', 'user'],
    'injected-manager-id' => ['$manager->id()', 'userId'],
    'factory-guard-user' => ['$factory->guard()->user()', 'user'],
    'factory-guard-id' => ['$factory->guard()->id()', 'userId'],
    'nullable-request' => ['$optionalRequest?->user()', 'user'],
    'nullable-guard-id' => ['$optionalGuard?->id()', 'userId'],
];
$cases = [];

foreach ($retrievals as $name => [$expression, $variable]) {
    $cases[$name.'-valid'] = '$'.$variable.' = '.$expression.';';
    $cases[$name.'-invalid'] = '$result = '.$expression.'; // error:'.$variable;
}

$cases += [
    'inline-user-argument' => 'consume(Auth::user()); // error:user',
    'inline-id-argument' => 'consume((int) Auth::id()); // error:userId',
    'inline-request-argument' => 'consume($request->user()); // error:user',
    'inline-condition' => 'if (auth()->user()) {} // error:user',
    'inline-return' => 'return Auth::id(); // error:userId',
    'inline-property' => '$userId = Auth::user()->id; // error:user',
    'inline-nullsafe-property' => '$userId = $request->user()?->id; // error:user',
    'inline-method' => '$userId = auth()->user()->getAuthIdentifier(); // error:user',
    'inline-array' => '$user = [Auth::user()]; // error:user',
    'inline-comparison' => '$user = Auth::user() !== null; // error:user',
    'inline-fallback' => '$user = Auth::user() ?? null; // error:user',
    'inline-assignment' => 'consume($user = Auth::user()); // error:user',
    'condition-assignment' => 'if ($user = Auth::user()) {} // error:user',
    'property-assignment' => '$object->user = Auth::user(); // error:user',
    'array-assignment' => '$users["user"] = $request->user(); // error:user',
    'dynamic-variable' => '$name = "user"; $$name = Auth::user(); // error:user',
    'user-id-name-for-user' => '$userId = Auth::user(); // error:user',
    'user-name-for-id' => '$user = Auth::id(); // error:userId',
    'incorrect-id-case' => '$userID = Auth::id(); // error:userId',
    'standalone-retrieval' => 'Auth::user(); // error:user',
    'integer-id-cast' => '$userId = (int) Auth::id(); consume($userId);',
    'string-id-cast' => '$userId = (string) auth()->id(); consume($userId);',
    'invalid-cast-target' => '$id = (int) Auth::id(); // error:userId',
    'user-cast' => '$user = (array) Auth::user(); // error:user',
    'subsequent-use' => '$user = $request->user(); consume($user); $user?->getAuthIdentifier();',
    'subsequent-id-use' => '$userId = Auth::id(); consume((int) $userId);',
    'closure-valid' => '$callback = function () { $user = Auth::user(); return $user; };',
    'closure-invalid' => '$callback = function () { return Auth::user(); }; // error:user',
    'conditional-statement' => 'if (Auth::check()) { $user = Auth::user(); consume($user); }',
    'uppercase-method-valid' => '$user = Auth::USER();',
    'uppercase-method-invalid' => '$result = Auth::USER(); // error:user',
    'dynamic-class-valid' => '$facade = Auth::class; $user = $facade::user();',
    'dynamic-class-invalid' => '$facade = Auth::class; $result = $facade::id(); // error:userId',
    'dynamic-method-valid' => '$method = "user"; $user = Auth::$method();',
    'dynamic-method-invalid' => '$method = "id"; $result = $guard->$method(); // error:userId',
    'stored-helper-valid' => '$auth = auth(); $user = $auth->user();',
    'stored-helper-invalid' => '$auth = auth(); $result = $auth->id(); // error:userId',
    'multiple-calls' => 'consume(Auth::user(), Auth::id()); // error:user,userId',
    'multiline-assignment' => <<<'PHP'
$user = Auth::user();
$userId =
    Auth::id();
$wrong =
    Auth::user(); // error:user
PHP,
    'other-auth-methods' => 'Auth::check(); Auth::guest(); Auth::logout(); Auth::loginUsingId(1); auth()->check(); $guard->check();',
    'first-class-callables' => '$callback = Auth::user(...); $callback = $request->user(...);',
    'unrelated-static-user' => '$result = OtherAuth::user();',
    'unrelated-static-id' => '$result = OtherAuth::id();',
    'unrelated-object' => '$result = $other->user(); $result = $other->id();',
    'unrelated-request-id' => '$result = $customRequest->id();',
    'unrelated-helper' => '$result = \\Fixtures\\auth()->user();',
    'unrelated-request-helper' => '$result = \\Fixtures\\request()->user();',
    'trait-consumer' => '',
];

try {
    $fixtures = [];

    foreach ($cases as $name => $body) {
        $function = 'check'.count($fixtures);
        $source = <<<'PHP'
<?php
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Auth as Authentication;
use Illuminate\Support\Facades\Request as RequestFacade;
use Fixtures\OtherAuth;

PHP;
        $source .= 'function '.$function.<<<'PHP'
(
    Illuminate\Http\Request $request,
    Illuminate\Foundation\Http\FormRequest $formRequest,
    Illuminate\Contracts\Auth\Guard $guard,
    Illuminate\Contracts\Auth\Factory $factory,
    Illuminate\Auth\AuthManager $manager,
    ?Illuminate\Http\Request $optionalRequest,
    ?Illuminate\Contracts\Auth\Guard $optionalGuard,
    Fixtures\OtherAuth $other,
    Fixtures\CustomRequest $customRequest,
    stdClass $object,
) {
PHP;
        $source .= "\n".$body."\n}\n";

        if ($name === 'trait-consumer') {
            $source .= 'class TraitConsumer { use \\Fixtures\\AuthRetrievals; }';
        }

        $fixtures['cases/'.$name.'.php'] = $source;
    }

    $fixtures['Support.php'] = <<<'PHP'
<?php
namespace Fixtures;

class OtherAuth
{
    public static function user(): mixed { return null; }
    public static function id(): mixed { return null; }
}

class CustomRequest extends \Illuminate\Http\Request
{
    public function id(): int { return 1; }
}

function auth(): OtherAuth { return new OtherAuth; }
function request(): OtherAuth { return new OtherAuth; }

trait AuthRetrievals
{
    public function retrieve(): void
    {
        $user = \Illuminate\Support\Facades\Auth::user();
        $userId = (int) \Illuminate\Support\Facades\Auth::id();
        $wrong = \Illuminate\Support\Facades\Auth::user(); // error:user
    }
}
PHP;
    $expected = [];

    foreach ($fixtures as $path => $source) {
        file_put_contents($directory.'/'.$path, $source);
        $expected[$path] = [];

        foreach (explode("\n", $source) as $index => $line) {
            if (preg_match('/\/\/ error:([A-Za-z,]+)/', $line, $matches)) {
                foreach (explode(',', $matches[1]) as $variable) {
                    $expected[$path][] = [$index + 1, $variable];
                }
            }
        }
    }

    $autoload = realpath($project.'/vendor/autoload.php');
    $bootstrap = realpath(__DIR__.'/../phpstan.neon.php');
    file_put_contents($directory.'/bootstrap.php', '<?php require '.var_export($autoload, true).'; require '.var_export($bootstrap, true).'; class_alias(\\Illuminate\\Support\\Facades\\Auth::class, "Auth");');
    file_put_contents($directory.'/phpstan.neon', <<<'NEON'
parameters:
    customRulesetUsed: true
    tmpDir: cache
    paths:
        - cases
        - Support.php
    parallel:
        maximumNumberOfProcesses: 0
services:
    -
        class: Strata\PHPStan\GeneralRules
        arguments:
            parser: @defaultAnalysisParser
        tags:
            - phpstan.rules.rule
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
        $path = preg_replace('/ \(in context of class [^)]+\)$/', '', $path);
        $relative = substr(realpath($path) ?: $path, strlen($directory) + 1);

        if (! array_key_exists($relative, $actual)) {
            throw new RuntimeException('Unexpected diagnostic file: '.$path);
        }

        foreach ($result['messages'] as $message) {
            if (($message['identifier'] ?? '') !== 'strata.general.requireAuthenticatedUserVariables'
                || ! preg_match('/to \$(userId|user) in a separate statement/', $message['message'], $matches)) {
                throw new RuntimeException('Unexpected PHPStan diagnostic: '.json_encode($message));
            }

            $actual[$relative][] = [$message['line'], $matches[1]];
        }
    }

    foreach ($expected as $path => $errors) {
        sort($errors);
        sort($actual[$path]);

        if ($errors !== $actual[$path]) {
            throw new RuntimeException($path."\nExpected: ".json_encode($errors)."\nActual: ".json_encode($actual[$path]));
        }
    }

    echo count($cases)." authenticated-user variable fixtures passed through PHPStan.\n";
} finally {
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);

    foreach ($files as $file) {
        $file->isDir() ? rmdir($file->getPathname()) : unlink($file->getPathname());
    }

    rmdir($directory);
}
