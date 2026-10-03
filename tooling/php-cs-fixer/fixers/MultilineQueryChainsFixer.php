<?php

namespace Strata\PHPcsFixer;

use PhpCsFixer\Fixer\WhitespacesAwareFixerInterface;
use PhpCsFixer\FixerDefinition\CodeSample;
use PhpCsFixer\FixerDefinition\FixerDefinition;
use PhpCsFixer\FixerDefinition\FixerDefinitionInterface;
use PhpCsFixer\Tokenizer\Token;
use PhpCsFixer\Tokenizer\Tokens;
use PhpCsFixer\WhitespacesFixerConfig;
use SplFileInfo;

final class MultilineQueryChainsFixer implements WhitespacesAwareFixerInterface
{
    private WhitespacesFixerConfig $whitespaces;

    public function __construct()
    {
        $this->whitespaces = new WhitespacesFixerConfig;
    }

    public function getName(): string
    {
        return 'Strata/multiline_query_chains';
    }

    public function getDefinition(): FixerDefinitionInterface
    {
        return new FixerDefinition('Place every chained method after ::query() on its own indented line.', [
            new CodeSample("<?php\n\$nodes = Node::query()->where('type', 'folder')->get();\n"),
        ]);
    }

    public function isCandidate(Tokens $tokens): bool
    {
        return $tokens->isTokenKindFound(T_DOUBLE_COLON)
            && $tokens->isAnyTokenKindsFound(Token::getObjectOperatorKinds());
    }

    public function isRisky(): bool
    {
        return false;
    }

    public function getPriority(): int
    {
        return 1;
    }

    public function supports(SplFileInfo $file): bool
    {
        return str_ends_with($file->getFilename(), '.php')
            && ! str_ends_with($file->getFilename(), '.blade.php');
    }

    public function setWhitespacesConfig(WhitespacesFixerConfig $config): void
    {
        $this->whitespaces = $config;
    }

    public function fix(SplFileInfo $file, Tokens $tokens): void
    {
        if (! $this->supports($file) || ! $this->isCandidate($tokens)) {
            return;
        }

        // Outer queries establish the indentation used by queries inside their arguments.
        for ($index = 0; $index < count($tokens); $index++) {
            if (! $tokens[$index]->isGivenKind(T_STRING) || strtolower($tokens[$index]->getContent()) !== 'query') {
                continue;
            }

            $previous = $tokens->getPrevMeaningfulToken($index);
            $open = $tokens->getNextMeaningfulToken($index);

            if ($previous === null || ! $tokens[$previous]->isGivenKind(T_DOUBLE_COLON)
                || $open === null || ! $tokens[$open]->equals('(')) {
                continue;
            }

            $close = $tokens->findBlockEnd(Tokens::BLOCK_TYPE_PARENTHESIS, $open);

            // Match the zero-argument call, not a first-class callable or another query API.
            if ($tokens->getNextMeaningfulToken($open) !== $close) {
                continue;
            }

            $indent = $this->lineIndent($tokens, $index).$this->whitespaces->getIndent();
            $calls = $this->chainedCalls($tokens, $close);

            // Insert from right to left to keep the collected call indexes valid.
            foreach (array_reverse($calls) as [$operator, $argumentsOpen, $argumentsClose]) {
                $originalIndent = $this->lineIndent($tokens, $operator);
                $this->indentArguments($tokens, $argumentsOpen, $argumentsClose, $originalIndent, $indent);

                $before = $operator - 1;
                $whitespace = $this->whitespaces->getLineEnding().$indent;

                if ($tokens[$before]->isWhitespace()) {

                    // Preserve blank lines and comment placement before an existing break.
                    $content = $tokens[$before]->getContent();

                    if (preg_match('/\r\n|\n|\r/', $content)) {
                        $whitespace = rtrim($content, " \t").$indent;
                    }

                    $tokens[$before] = new Token([T_WHITESPACE, $whitespace]);
                } else {
                    $tokens->insertAt($operator, new Token([T_WHITESPACE, $whitespace]));
                }
            }
        }
    }

    /** @return list<array{int, int, int}> */
    private function chainedCalls(Tokens $tokens, int $close): array
    {
        $calls = [];

        while (($operator = $tokens->getNextMeaningfulToken($close)) !== null && $tokens[$operator]->isObjectOperator()) {
            $name = $tokens->getNextMeaningfulToken($operator);

            if ($name === null) {
                break;
            }

            $block = Tokens::detectBlockType($tokens[$name]);

            if ($block !== null && $block['isStart']) {
                $name = $tokens->findBlockEnd($block['type'], $name);
            } elseif (! $tokens[$name]->isGivenKind([T_STRING, T_VARIABLE])) {
                break;
            }

            $open = $tokens->getNextMeaningfulToken($name);

            if ($open === null || ! $tokens[$open]->equals('(')) {
                break;
            }

            $close = $tokens->findBlockEnd(Tokens::BLOCK_TYPE_PARENTHESIS, $open);
            $calls[] = [$operator, $open, $close];
        }

        return $calls;
    }

    private function lineIndent(Tokens $tokens, int $index): string
    {
        $line = '';

        for ($index--; $index >= 0; $index--) {
            $content = $tokens[$index]->getContent();
            $lf = strrpos($content, "\n");
            $cr = strrpos($content, "\r");
            $newline = max($lf === false ? -1 : $lf, $cr === false ? -1 : $cr);

            if ($newline >= 0) {
                $line = substr($content, $newline + 1).$line;

                break;
            }

            $line = $content.$line;
        }

        preg_match('/^[\t ]*/', $line, $matches);

        return $matches[0];
    }

    private function indentArguments(Tokens $tokens, int $open, int $close, string $from, string $to): void
    {
        if ($from === $to) {
            return;
        }

        for ($index = $open + 1; $index < $close; $index++) {
            if (! $tokens[$index]->isWhitespace()) {
                continue;
            }

            $content = preg_replace_callback('/(\r\n|\n|\r)([\t ]*)\z/', static function (array $matches) use ($from, $to): string {
                return str_starts_with($matches[2], $from)
                    ? $matches[1].$to.substr($matches[2], strlen($from))
                    : $matches[0];
            }, $tokens[$index]->getContent());

            $tokens[$index] = new Token([T_WHITESPACE, $content]);
        }
    }
}
