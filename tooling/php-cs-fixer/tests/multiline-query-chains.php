<?php

use PhpCsFixer\Tokenizer\Tokens;
use PhpCsFixer\WhitespacesFixerConfig;
use Strata\PHPcsFixer\MultilineQueryChainsFixer;

// Run with STRATA_TEST_PROJECT pointing to a project with friendsofphp/php-cs-fixer installed.
$project = getenv('STRATA_TEST_PROJECT');

if ($project === false || $project === '') {
    throw new RuntimeException('Set STRATA_TEST_PROJECT to a project with friendsofphp/php-cs-fixer installed.');
}

require $project.'/vendor/autoload.php';
require_once __DIR__.'/../fixers/MultilineQueryChainsFixer.php';

$cases = [];

foreach (['Node', '\\App\\Models\\Node', 'Models\\Node', 'self', 'static', 'parent', '$model'] as $receiver) {
    $cases['receiver '.$receiver] = [
        "<?php\n\$nodes = {$receiver}::query()->where('type', 'folder')->get();\n",
        "<?php\n\$nodes = {$receiver}::query()\n    ->where('type', 'folder')\n    ->get();\n",
    ];
}

$cases['single call'] = [
    "<?php\nreturn Node::query()->get();\n",
    "<?php\nreturn Node::query()\n    ->get();\n",
];
$cases['case insensitive'] = [
    "<?php\nreturn Node::QUERY()->get();\n",
    "<?php\nreturn Node::QUERY()\n    ->get();\n",
];
$cases['nullsafe and dynamic methods'] = [
    '<?php $nodes = Node::query()?->first()?->{$method}()->$method();',
    "<?php \$nodes = Node::query()\n    ?->first()\n    ?->{\$method}()\n    ->\$method();",
];
$cases['first-class chained callable'] = [
    '<?php $get = Node::query()->get(...);',
    "<?php \$get = Node::query()\n    ->get(...);",
];
$cases['multiple expressions'] = [
    '<?php $a = Node::query()->get(); $b = Node::query()->count();',
    "<?php \$a = Node::query()\n    ->get(); \$b = Node::query()\n        ->count();",
];
$cases['partial split'] = [
    "<?php\n\$nodes = Node::query()\n    ->where('type', 'folder')->get();\n",
    "<?php\n\$nodes = Node::query()\n    ->where('type', 'folder')\n    ->get();\n",
];
$cases['nested queries'] = [
    "<?php\n\$nodes = Node::query()->whereIn('id', Other::query()->select('id'))->get();\n",
    "<?php\n\$nodes = Node::query()\n    ->whereIn('id', Other::query()\n        ->select('id'))\n    ->get();\n",
];
$cases['unrelated argument chain'] = [
    "<?php\nreturn Node::query()->where('uid', Str::uuid()->toString())->get();\n",
    "<?php\nreturn Node::query()\n    ->where('uid', Str::uuid()->toString())\n    ->get();\n",
];
$cases['comments between calls'] = [
    "<?php\n\$nodes = Node::query() /* connection */ ->useWritePdo() // write\n->get();\n",
    "<?php\n\$nodes = Node::query() /* connection */\n    ->useWritePdo() // write\n    ->get();\n",
];
$cases['multiline comment'] = [
    "<?php\n\$nodes = Node::query() /* connection\nchoice */ ->get();\n",
    "<?php\n\$nodes = Node::query() /* connection\nchoice */\n    ->get();\n",
];
$cases['comment inside query'] = [
    "<?php\nreturn Node::query(/* default connection */)->get();\n",
    "<?php\nreturn Node::query(/* default connection */)\n    ->get();\n",
];
$cases['keep blank lines'] = [
    "<?php\nreturn Node::query()\n\n->get();\n",
    "<?php\nreturn Node::query()\n\n    ->get();\n",
];
$cases['only query receiver'] = [
    "<?php\nreturn decorate(Node::query()->get())->format()->send();\n",
    "<?php\nreturn decorate(Node::query()\n    ->get())->format()->send();\n",
];

$cases['folder arrays'] = [
    <<<'PHP'
<?php
class Service
{
    public function createFolder(int $userId, string $name, string $clientId): Node
    {
        $folder = Node::query()->useWritePdo()->firstOrCreate([
            'user_id' => $userId,
            'client_id' => $clientId,
        ], [
            'uid' => Str::uuid()->toString(),
            'parent_node_id' => null,
            'name' => $name,
            'type' => 'folder',
        ]);

        return $folder;
    }
}
PHP,
    <<<'PHP'
<?php
class Service
{
    public function createFolder(int $userId, string $name, string $clientId): Node
    {
        $folder = Node::query()
            ->useWritePdo()
            ->firstOrCreate([
                'user_id' => $userId,
                'client_id' => $clientId,
            ], [
                'uid' => Str::uuid()->toString(),
                'parent_node_id' => null,
                'name' => $name,
                'type' => 'folder',
            ]);

        return $folder;
    }
}
PHP,
];

$cases['nested closure'] = [
    <<<'PHP'
<?php
return Node::query()->where(function ($query) {
    $query->where('type', 'folder')->orWhere('name', 'test');
    return Other::query()->exists();
})->get();
PHP,
    <<<'PHP'
<?php
return Node::query()
    ->where(function ($query) {
        $query->where('type', 'folder')->orWhere('name', 'test');
        return Other::query()
            ->exists();
    })
    ->get();
PHP,
];

$cases['heredoc contents'] = [
    <<<'PHP'
<?php
return Node::query()->whereRaw(<<<'SQL'
    name = '->get()'
    SQL)->get();
PHP,
    <<<'PHP'
<?php
return Node::query()
    ->whereRaw(<<<'SQL'
    name = '->get()'
    SQL)
    ->get();
PHP,
];

foreach ([
    '<?php $nodes = Node::query();',
    '<?php $nodes = Node::where("type", "folder")->get();',
    '<?php $nodes = $builder->query()->where("type", "folder")->get();',
    '<?php $value = Str::uuid()->toString();',
    '<?php $query = Node::query(...)->bindTo($model);',
    '<?php $query = Other::query("sql")->fetch();',
    '<?php $query = Other::query(...$arguments)->fetch();',
    '<?php $query = Other::{"query"}()->fetch();',
    '<?php $value = wrapper(Node::query())->unrelated()->chain();',
    '<?php // Node::query()->get();',
    '<?php $text = "Node::query()->get()";',
    "<?php\n\$nodes = Node::query()\n    ->where('type', 'folder')\n    ->get();\n",
    "<?php\n\$sql = <<<'SQL'\nNode::query()->get()\nSQL;\n",
] as $index => $source) {
    $cases['unchanged '.$index] = [$source, $source];
}

function assertSame(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message."\nExpected: ".var_export($expected, true)."\nActual: ".var_export($actual, true));
    }
}

/** @return list<array{int, string}> */
function significantTokens(string $source): array
{
    $result = [];

    foreach (PhpToken::tokenize($source, TOKEN_PARSE) as $token) {
        if ($token->id !== T_WHITESPACE) {
            $result[] = [$token->id, $token->text];
        }
    }

    return $result;
}

$fixer = new MultilineQueryChainsFixer;
$file = new SplFileInfo('example.php');

foreach ($cases as $name => [$source, $expected]) {
    $tokens = Tokens::fromCode($source);
    $fixer->fix($file, $tokens);
    assertSame($expected, $tokens->generateCode(), $name.': formatting');
    assertSame(significantTokens($source), significantTokens($tokens->generateCode()), $name.': PHP tokens preserved');
    $tokens->clearChanged();
    $fixer->fix($file, $tokens);
    assertSame(false, $tokens->isChanged(), $name.': second pass unchanged');
}

foreach ([['    ', "\r\n"], ["\t", "\n"], ['  ', "\n"]] as [$indent, $newline]) {
    $fixer->setWhitespacesConfig(new WhitespacesFixerConfig($indent, $newline));
    $source = "<?php{$newline}function nodes() {{$newline}{$indent}return Node::query()->get();{$newline}}{$newline}";
    $expected = "<?php{$newline}function nodes() {{$newline}{$indent}return Node::query(){$newline}{$indent}{$indent}->get();{$newline}}{$newline}";
    $tokens = Tokens::fromCode($source);
    $fixer->fix($file, $tokens);
    assertSame($expected, $tokens->generateCode(), 'Configured whitespace');
    $tokens->clearChanged();
    $fixer->fix($file, $tokens);
    assertSame(false, $tokens->isChanged(), 'Configured whitespace second pass unchanged');
}

$source = '<?php Node::query()->get();';
$tokens = Tokens::fromCode($source);
$fixer->fix(new SplFileInfo('example.blade.php'), $tokens);
assertSame($source, $tokens->generateCode(), 'Blade templates remain unchanged');

echo count($cases)." query-chain cases and 4 whitespace/file checks passed through PHP-CS-Fixer.\n";
