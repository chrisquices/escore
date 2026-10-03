<?php

// Run with STRATA_TEST_PROJECT pointing to a Laravel project with PHPStan installed.
$project = getenv('STRATA_TEST_PROJECT');

if ($project === false || ! is_file($project.'/vendor/bin/phpstan')) {
    throw new RuntimeException('Set STRATA_TEST_PROJECT to a Laravel project with PHPStan installed.');
}

$directory = realpath(sys_get_temp_dir()).'/strata-returned-array-variables-'.bin2hex(random_bytes(6));
mkdir($directory);
mkdir($directory.'/cases');

$cases = [
    'matching-variable' => "return ['name' => \$name];",
    'mismatched-variable' => "return ['name' => \$appName]; // errors:1",
    'case-mismatch' => "return ['Name' => \$name]; // errors:1",
    'function-call' => "return ['name' => config('app.name')]; // errors:1",
    'method-call' => "return ['name' => \$object->getName()]; // errors:1",
    'static-call' => "return ['name' => parent::name()]; // errors:1",
    'string-literal' => "return ['name' => 'Strata']; // errors:1",
    'integer-literal' => "return ['count' => 1]; // errors:1",
    'boolean-literal' => "return ['sidebarOpen' => true]; // errors:1",
    'null-literal' => "return ['user' => null]; // errors:1",
    'property' => "return ['name' => \$object->name]; // errors:1",
    'nullsafe-property' => "return ['name' => \$optionalObject?->name]; // errors:1",
    'array-offset' => "return ['name' => \$data['name']]; // errors:1",
    'cast' => "return ['name' => (string) \$name]; // errors:1",
    'coalesce' => "return ['name' => \$name ?? 'Strata']; // errors:1",
    'ternary-value' => "return ['name' => \$flag ? \$name : \$appName]; // errors:1",
    'inline-assignment' => "return ['name' => \$name = 'Strata']; // errors:1",
    'variable-variable' => "return ['name' => \$\$key]; // errors:1",
    'closure-value' => "return ['name' => function () { return 'Strata'; }]; // errors:1",
    'nested-array' => "return ['auth' => ['user' => \$user]]; // errors:1",
    'nested-array-single-error' => "return ['auth' => ['user' => null]]; // errors:1",
    'extracted-nested-array' => "\$auth = ['user' => \$user]; return ['auth' => \$auth];",
    'spread-variable' => 'return [...$data];',
    'spread-call' => 'return [...parent::share()];',
    'spread-array' => "return [...['name' => 'Strata']];",
    'spread-with-matching-variable' => "return [...parent::share(), 'name' => \$name];",
    'spread-with-invalid-value' => "return [...parent::share(), 'name' => config('app.name')]; // errors:1",
    'unkeyed-list' => "return ['Strata', config('app.name'), \$object->name];",
    'mixed-list' => "return [1, 'name' => \$name];",
    'numeric-key-variable' => 'return [0 => $name];',
    'numeric-key-literal' => 'return [0 => 1]; // errors:1',
    'numeric-string-key' => "return ['0' => \$name];",
    'non-identifier-key-variable' => "return ['app-name' => \$appName];",
    'non-identifier-key-literal' => "return ['app-name' => 'Strata']; // errors:1",
    'dynamic-key-variable' => 'return [$key => $name];',
    'dynamic-key-literal' => "return [\$key => 'Strata']; // errors:1",
    'known-key-variable' => "\$key = 'name'; return [\$key => \$name];",
    'known-key-mismatch' => "\$key = 'name'; return [\$key => \$appName]; // errors:1",
    'class-constant-key-variable' => 'return [self::NAME => $name];',
    'class-constant-key-mismatch' => 'return [self::NAME => $appName]; // errors:1',
    'computed-known-key' => "return ['na'.'me' => \$appName]; // errors:1",
    'snake-case-key' => "\$app_name = 'Strata'; return ['app_name' => \$app_name];",
    'unicode-key' => "\$café = 'Strata'; return ['café' => \$café];",
    'empty-array' => 'return [];',
    'long-array-syntax' => "return array('name' => \$name);",
    'long-array-invalid' => "return array('name' => 'Strata'); // errors:1",
    'reference-variable' => "return ['name' => &\$name];",
    'already-assigned-array' => "\$data = ['name' => config('app.name')]; return \$data;",
    'returned-call' => "return array_merge(\$data, ['name' => config('app.name')]);",
    'closure-return' => "\$callback = function () { return ['name' => 'Strata']; }; return []; // errors:1",
    'conditional-return' => "if (\$flag) { return ['name' => 'Strata']; } return ['name' => \$name]; // errors:1",
    'multiple-errors' => <<<'PHP'
return [
    'name' => config('app.name'), // errors:1
    'auth' => ['user' => $user], // errors:1
    'sidebarOpen' => $flag, // errors:1
];
PHP,
    'multiline-value' => <<<'PHP'
return [
    'name' =>
        config('app.name'), // errors:1
];
PHP,
    'prepared-values' => <<<'PHP'
$name = config('app.name');
$auth = ['user' => $user];
$sidebarOpen = ! $flag || $name === 'Strata';

return [
    ...parent::share(),
    'name' => $name,
    'auth' => $auth,
    'sidebarOpen' => $sidebarOpen,
];
PHP,
];

try {
    $expected = [];

    foreach ($cases as $name => $body) {
        $class = 'Case'.count($expected);
        $source = "<?php\nclass {$class} extends \\Fixtures\\BaseShare\n".<<<'PHP'
{
    private const NAME = 'name';

    protected function values(stdClass $object, ?stdClass $optionalObject, string $key, array $data, bool $flag): array
    {
        $name = 'Strata';
        $appName = 'Strata';
        $user = null;
PHP;
        $source .= "\n".$body."\n    }\n}\n";
        $path = 'cases/'.$name.'.php';
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

class BaseShare
{
    protected function share(): array { return []; }
    protected function name(): string { return 'Strata'; }
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
        - cases
    scanFiles:
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
        $relative = substr(realpath($path) ?: $path, strlen($directory) + 1);

        if (! array_key_exists($relative, $actual)) {
            throw new RuntimeException('Unexpected diagnostic file: '.$path);
        }

        foreach ($result['messages'] as $message) {
            if (($message['identifier'] ?? '') !== 'strata.general.requireNamedVariablesInReturnedArrays'
                || ! str_contains($message['message'], 'before returning the array')) {
                throw new RuntimeException('Unexpected PHPStan diagnostic: '.json_encode($message));
            }

            $actual[$relative][] = $message['line'];
        }
    }

    foreach ($expected as $path => $lines) {
        sort($lines);
        sort($actual[$path]);

        if ($lines !== $actual[$path]) {
            throw new RuntimeException($path."\nExpected: ".json_encode($lines)."\nActual: ".json_encode($actual[$path]));
        }
    }

    echo count($cases)." returned-array variable fixtures passed through PHPStan.\n";
} finally {
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);

    foreach ($files as $file) {
        $file->isDir() ? rmdir($file->getPathname()) : unlink($file->getPathname());
    }

    rmdir($directory);
}
