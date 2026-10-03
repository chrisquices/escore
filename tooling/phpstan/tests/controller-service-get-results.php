<?php

// Run with STRATA_TEST_PROJECT pointing to a Laravel project with PHPStan installed.
$project = getenv('STRATA_TEST_PROJECT');

if ($project === false || ! is_file($project.'/vendor/bin/phpstan')) {
    throw new RuntimeException('Set STRATA_TEST_PROJECT to a Laravel project with PHPStan installed.');
}

$directory = realpath(sys_get_temp_dir()).'/strata-controller-service-get-results-'.bin2hex(random_bytes(6));
mkdir($directory);
mkdir($directory.'/cases');

$cases = [
    'missing-suffix' => '$nodes = $this->nodeService->getNodes(userId: 1, parentUid: null); // error',
    'raw-suffix' => '$nodesRaw = $this->nodeService->getNodes(userId: 1, parentUid: null);',
    'wrong-case' => '$nodesraw = $this->nodeService->getNodes(); // error',
    'raw-in-middle' => '$nodesRawData = $this->nodeService->getNodes(); // error',
    'other-service' => '$items = $this->otherService->getNodes(); // error',
    'nullable' => '$nodes = $this->optionalService?->getNodes(); // error',
    'nullable-raw' => '$nodesRaw = $this->optionalService?->getNodes();',
    'reference' => '$nodes =& $this->nodeService->getReference(); // error',
    'reference-raw' => '$nodesRaw =& $this->nodeService->getReference();',
    'case-insensitive-method' => '$nodes = $this->nodeService->GETNodes(); // error',
    'bare-get' => '$nodes = $this->nodeService->get(); // error',
    'multiline' => <<<'PHP'
$nodes = // error
    $this->nodeService->getNodes(
        userId: 1,
        parentUid: null,
    );
PHP,
    'write-method' => '$nodes = $this->nodeService->createNodes();',
    'get-not-prefix' => '$nodes = $this->nodeService->forgetNodes();',
    'unrelated-getter' => '$nodes = $this->helper->getNodes();',
    'local-service' => '$service = $this->nodeService; $nodes = $service->getNodes();',
    'other-instance' => '$other = $this; $nodes = $other->nodeService->getNodes();',
    'controller-getter' => '$nodes = $this->getNodes();',
    'callable' => '$callback = $this->nodeService->getNodes(...);',
    'unassigned' => '$this->nodeService->getNodes();',
    'transformed-result' => '$nodes = array_values($this->nodeService->getNodes());',
    'non-controller' => '$nodes = $this->nodeService->getNodes();',
    'app-controller' => '$nodes = $this->nodeService->getNodes(); // error',
    'app-controller-raw' => '$nodesRaw = $this->nodeService->getNodes();',
];

try {
    $expected = [];

    foreach ($cases as $name => $body) {
        $class = 'Case'.count($expected);
        $parent = match ($name) {
            'non-controller' => '',
            'app-controller', 'app-controller-raw' => ' extends \\App\\Http\\Controllers\\Controller',
            default => ' extends \\Illuminate\\Routing\\Controller',
        };
        $source = "<?php\nnamespace Fixtures;\nclass {$class}{$parent}\n".<<<'PHP'
{
    private NodeService $nodeService;
    private NodeService $otherService;
    private ?NodeService $optionalService;
    private Helper $helper;

    protected function getNodes(): array { return []; }

    protected function check(): void
    {
PHP;
        $source .= "\n".$body."\n    }\n}\n";
        $path = 'cases/'.$name.'.php';
        file_put_contents($directory.'/'.$path, $source);
        $expected[$path] = [];

        foreach (explode("\n", $source) as $index => $line) {
            if (str_contains($line, '// error')) {
                $expected[$path][] = $index + 1;
            }
        }
    }

    file_put_contents($directory.'/Support.php', <<<'PHP'
<?php
namespace App\Http\Controllers;

abstract class Controller {}

namespace Fixtures;

class NodeService
{
    private array $nodes = [];

    public function getNodes(int $userId = 1, ?string $parentUid = null): array { return []; }
    public function &getReference(): array { return $this->nodes; }
    public function get(): array { return []; }
    public function createNodes(): array { return []; }
    public function forgetNodes(): array { return []; }
}

class Helper
{
    public function getNodes(): array { return []; }
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
rules:
    - Strata\PHPStan\ControllerRules
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
            if (($message['identifier'] ?? '') !== 'strata.controller.requireRawSuffixForServiceGetResults') {
                throw new RuntimeException('Unexpected PHPStan diagnostic: '.json_encode($message));
            }

            $actual[$relative][] = $message['line'];

            if (! str_contains($message['message'], 'must end in Raw') || ! str_contains($message['message'], 'Rename $')) {
                throw new RuntimeException('Missing actionable naming guidance: '.$message['message']);
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

    echo count($cases)." controller service-get result fixtures passed through PHPStan.\n";
} finally {
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);

    foreach ($files as $file) {
        $file->isDir() ? rmdir($file->getPathname()) : unlink($file->getPathname());
    }

    rmdir($directory);
}
