<?php

use PhpCsFixer\Tokenizer\Tokens;
use Strata\PHPcsFixer\BlankLineAboveCommentsFixer;

// Set STRATA_TEST_PROJECT to a project with friendsofphp/php-cs-fixer installed
// to run every case through the custom fixer.
$project = getenv('STRATA_TEST_PROJECT');

if ($project === false || $project === '') {
    throw new RuntimeException('Set STRATA_TEST_PROJECT to a project with friendsofphp/php-cs-fixer installed.');
}

require $project.'/vendor/autoload.php';
require_once __DIR__.'/../fixers/BlankLineAboveCommentsFixer.php';

$fixer = new BlankLineAboveCommentsFixer;
$cases = [];

foreach (['// Next action', '# Next action', '/* Next action */', "/**\n * Next action\n */"] as $comment) {
    $cases[] = [
        "<?php\n\$first = 1;\n{$comment}\n\$second = 2;\n",
        "<?php\n\$first = 1;\n\n{$comment}\n\$second = 2;\n",
    ];
}

foreach (["\n", "\r\n", "\r"] as $newline) {
    $cases[] = [
        "<?php{$newline}// First{$newline}# Second{$newline}/* Third */{$newline}",
        "<?php{$newline}{$newline}// First{$newline}# Second{$newline}/* Third */{$newline}",
    ];
}

foreach (["\n\n", "\n \t\n", "\n\n\n"] as $gap) {
    $source = "<?php\n\$first = 1;{$gap}  // Second\n\$second = 2;\n";
    $cases[] = [$source, $source];
}

foreach ([
    '<?php $value = 1; // Inline',
    '<?php $value = /* Inline */ 1;',
    '<?php /* Inline */ $value = 1;',
    "<?php\n/* Inline */ \$value = 1;",
    "<?php\n/* First */ /* Second */\n\$value = 1;",
    "<?php\n\$value = /* Multiline\ncomment */ 1;",
    "<?php\n/* Multiline\ncomment */ \$value = 1;",
    "<?php\nfunction run() {\n    return /* Inline */ 1;\n}",
    "<?php\n// Inline with closing tag ?>\n<p>Text</p>",
    "<?php\n\$line = '// text';\n\$block = '/* text */';\n\$hash = '# text';",
    "<!-- HTML comment -->\n<?php\n\$value = 1;\n?>\n// Plain text",
    "<?php\n#[Example]\nclass Demo {}",
    "<?php\n__halt_compiler();\n// Plain data\n/* Plain data */",
] as $source) {
    $cases[] = [$source, $source];
}

$strings = <<<'PHP'
<?php
$nowdoc = <<<'TEXT'
// not a comment
/* not a comment */
# not a comment
TEXT;
$heredoc = <<<TEXT
// not a comment
/* not a comment */
TEXT;
PHP;
$cases[] = [$strings, $strings];

$cases[] = [
    "<?php\nfunction run() {\n\t// Action\n\treturn 1;\n}\n",
    "<?php\nfunction run() {\n\n\t// Action\n\treturn 1;\n}\n",
];
$cases[] = [
    "<?php\nclass Demo {\n    /** Action. */\n    public function show() {}\n}\n",
    "<?php\nclass Demo {\n\n    /** Action. */\n    public function show() {}\n}\n",
];
$cases[] = [
    "<?php\n\$items = [\n    // Item\n    1,\n];\n",
    "<?php\n\$items = [\n    // Item\n    1,\n];\n",
];
$cases[] = ["<?php\n// Last", "<?php\n\n// Last"];
$cases[] = ["<?php\n/* Last */", "<?php\n\n/* Last */"];
$cases[] = ["\xEF\xBB\xBF<?php\n// First\n", "\xEF\xBB\xBF<?php\n\n// First\n"];
$cases[] = ["<?php\n\$label = '語';\n// Next\n", "<?php\n\$label = '語';\n\n// Next\n"];
$cases[] = ["#!/usr/bin/env php\n<?php\n// First\n", "#!/usr/bin/env php\n<?php\n\n// First\n"];
$cases[] = [
    "<?php\n/** First */\n/** Second */\nfunction run() {}\n",
    "<?php\n\n/** First */\n/** Second */\nfunction run() {}\n",
];

foreach (["/* First\n * continued\n */", "/** First\n * continued\n */", '// First', '# First'] as $first) {
    $cases[] = [
        "<?php\n\$value = 1;\n{$first}\n// Second\n/* Third */\n\$value = 2;\n",
        "<?php\n\$value = 1;\n\n{$first}\n// Second\n/* Third */\n\$value = 2;\n",
    ];
}

$cases[] = [
    <<<'PHP'
<?php
return [
    'postmark' => [
        'transport' => 'postmark',
        // 'message_stream_id' => env('POSTMARK_MESSAGE_STREAM_ID'),
        // 'client' => [
        //     'timeout' => 5,
        // ],
    ],
];
PHP,
    <<<'PHP'
<?php
return [
    'postmark' => [
        'transport' => 'postmark',
        // 'message_stream_id' => env('POSTMARK_MESSAGE_STREAM_ID'),
        // 'client' => [
        //     'timeout' => 5,
        // ],
    ],
];
PHP,
];
$cases[] = [
    "<?php\n\$query = Node::query()\n    // ->where('type', 'folder')\n    // ->where('active', true)\n    ->get();\n",
    "<?php\n\$query = Node::query()\n\n    // ->where('type', 'folder')\n    // ->where('active', true)\n    ->get();\n",
];
$cases[] = [
    "<?php\n\$first = 1;\n// First group\n// Continued\n\$second = 2;\n// Second group\n// Continued\n",
    "<?php\n\$first = 1;\n\n// First group\n// Continued\n\$second = 2;\n\n// Second group\n// Continued\n",
];
$cases[] = [
    "<?php\n\$value = 1; // Inline\n// Standalone group\n// Continued\n",
    "<?php\n\$value = 1; // Inline\n\n// Standalone group\n// Continued\n",
];

foreach ([
    "<?php\n\$value = 1;\n\n// First\n// Second\n",
    "<?php\n\$value = 1;\n\n// First\n\n// Second\n",
    "<?php\n\$value = 1;\n\n// First\n// Second\n\n# Third\n# Fourth\n",
] as $source) {
    $cases[] = [$source, $source];
}

foreach ([['[', ']'], ['array(', ')']] as [$open, $close]) {
    foreach (['// Item', '# Item', '/* Item */', "/**\n     * Item\n     */"] as $comment) {
        $source = "<?php\n\$items = {$open}\n    {$comment}\n    1,\n    {$comment}\n    2,\n    {$comment}\n{$close};\n";
        $cases[] = [$source, $source];
    }
}

foreach ([
    "<?php\nreturn [\n    'nested' => array(\n        // Nested\n        [\n            // Deeply nested\n            'value',\n        ],\n    ),\n];\n",
    "<?php\n\$items = [\n    // Item\n    env(\n        // Argument inside an array value\n        'ITEM',\n    ),\n];\n",
    "<?php\n\$items = array /* array syntax */ (\n    // Item\n    'value',\n);\n",
    "<?php\n\$items = [\n    // Commented closing brackets: ] ) }\n    'brackets' => '[]()',\n    // Item\n    1,\n];\n",
    "<?php\n\$items = [\n\n    // Keep existing spacing\n    1,\n];\n",
] as $source) {
    $cases[] = [$source, $source];
}

foreach (["\n", "\r\n", "\r"] as $newline) {
    $cases[] = [
        "<?php{$newline}\$items = [{$newline}    // Array comment{$newline}    1,{$newline}];{$newline}// Outside{$newline}\$value = 2;{$newline}",
        "<?php{$newline}\$items = [{$newline}    // Array comment{$newline}    1,{$newline}];{$newline}{$newline}// Outside{$newline}\$value = 2;{$newline}",
    ];
}

foreach ([
    "\$value = \$items[\n    // Array access is not an array literal\n    'key'\n];",
    "[\n    // Destructuring is not an array literal\n    \$value\n] = \$items;",
    "#[Example(\n    // Attribute syntax is not an array literal\n    'value'\n)]\nclass Demo {}",
] as $source) {
    $cases[] = ["<?php\n{$source}\n", "<?php\n".str_replace("\n    //", "\n\n    //", $source)."\n"];
}

$cases[] = [
    <<<'PHP'
<?php
return [
    // Array comment
    'callback' => function () {
        // Function comment
        $nested = [
            // Nested array comment
            1,
        ];
        // Another function comment
        return $nested;
    },
    // Array comment after function
    'service' => new class {
        // Class comment
        public function run() {}
    },
    // Array comment after class
];
PHP,
    <<<'PHP'
<?php
return [
    // Array comment
    'callback' => function () {

        // Function comment
        $nested = [
            // Nested array comment
            1,
        ];

        // Another function comment
        return $nested;
    },
    // Array comment after function
    'service' => new class {

        // Class comment
        public function run() {}
    },
    // Array comment after class
];
PHP,
];

function assertSame(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message."\nExpected: ".var_export($expected, true)."\nActual: ".var_export($actual, true));
    }
}

/** @return list<array{int, string}> */
function significantTokens(string $source): array
{
    $tokens = [];

    foreach (PhpToken::tokenize($source, TOKEN_PARSE) as $token) {
        if ($token->id !== T_WHITESPACE) {
            $tokens[] = [$token->id, $token->text];
        }
    }

    return $tokens;
}

foreach ($cases as $index => [$source, $expected]) {
    $label = 'Case '.($index + 1);
    $tokens = Tokens::fromCode($source);
    $file = new SplFileInfo('example.php');
    $fixer->fix($file, $tokens);
    assertSame($expected, $tokens->generateCode(), $label.': PHP-CS-Fixer output');
    assertSame(significantTokens($source), significantTokens($tokens->generateCode()), $label.': PHP tokens and output text are preserved');
    $tokens->clearChanged();
    $fixer->fix($file, $tokens);
    assertSame(false, $tokens->isChanged(), $label.': PHP-CS-Fixer second pass is unchanged');
}

$source = "<?php\n// Blade is excluded\n";
$tokens = Tokens::fromCode($source);
$fixer->fix(new SplFileInfo('example.blade.php'), $tokens);
assertSame($source, $tokens->generateCode(), 'Blade templates remain unchanged');

echo count($cases)." comment-spacing cases passed through PHP-CS-Fixer.\n";
