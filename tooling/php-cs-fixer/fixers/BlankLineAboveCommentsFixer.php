<?php

namespace Strata\PHPcsFixer;

use PhpCsFixer\Fixer\FixerInterface;
use PhpCsFixer\FixerDefinition\CodeSample;
use PhpCsFixer\FixerDefinition\FixerDefinition;
use PhpCsFixer\FixerDefinition\FixerDefinitionInterface;
use PhpCsFixer\Tokenizer\Tokens;
use RuntimeException;
use SplFileInfo;

final class BlankLineAboveCommentsFixer implements FixerInterface
{
    public function getName(): string
    {
        return 'Strata/blank_line_above_comments';
    }

    public function getDefinition(): FixerDefinitionInterface
    {
        return new FixerDefinition('Add a blank line above each group of consecutive standalone PHP comments outside array literals.', [
            new CodeSample("<?php\n\$first = 1;\n// Next action\n\$second = 2;\n"),
        ]);
    }

    public function isCandidate(Tokens $tokens): bool
    {
        return $tokens->isAnyTokenKindsFound([T_COMMENT, T_DOC_COMMENT]);
    }

    public function isRisky(): bool
    {
        return false;
    }

    public function getPriority(): int
    {
        return -100;
    }

    public function supports(SplFileInfo $file): bool
    {
        return str_ends_with($file->getFilename(), '.php')
            && ! str_ends_with($file->getFilename(), '.blade.php');
    }

    public function fix(SplFileInfo $file, Tokens $tokens): void
    {
        if (! $this->supports($file) || ! $this->isCandidate($tokens)) {
            return;
        }

        $source = $tokens->generateCode();
        $offsets = $this->missingBlankLineOffsets($source, $tokens);

        if ($offsets === []) {
            return;
        }

        preg_match('/\r\n|\n|\r/', $source, $matches);
        $newline = $matches[0] ?? "\n";
        $fixed = '';
        $cursor = 0;

        foreach ($offsets as $offset) {
            $fixed .= substr($source, $cursor, $offset - $cursor).$newline;
            $cursor = $offset;
        }

        $tokens->setCode($fixed.substr($source, $cursor));
    }

    /** @return list<int> */
    private function missingBlankLineOffsets(string $source, Tokens $tokens): array
    {
        $lines = preg_split('/\r\n|\n|\r/', $source, -1, PREG_SPLIT_OFFSET_CAPTURE);

        if ($lines === false) {
            throw new RuntimeException('Unable to split PHP source into lines: '.preg_last_error_msg());
        }

        $offsets = [];
        $line = 0;
        $previousCommentEndLine = null;
        $position = 0;
        $arrayContexts = [];

        foreach ($tokens as $index => $token) {
            $start = $position;
            $position += strlen($token->getContent());
            $block = Tokens::detectBlockType($token);

            if ($block !== null) {
                if ($block['isStart']) {
                    $previous = $tokens->getPrevMeaningfulToken($index);
                    $isArray = $block['type'] === Tokens::BLOCK_TYPE_ARRAY_BRACKET
                        || ($block['type'] === Tokens::BLOCK_TYPE_PARENTHESIS
                            && $previous !== null && $tokens[$previous]->isGivenKind(T_ARRAY));

                    // Function/class bodies inside array values have their own comment rules.
                    $arrayContexts[] = $isArray
                        || ($block['type'] !== Tokens::BLOCK_TYPE_BRACE && end($arrayContexts));
                } else {
                    array_pop($arrayContexts);
                }
            }

            if (! $token->isGivenKind([T_COMMENT, T_DOC_COMMENT]) || end($arrayContexts)) {
                continue;
            }

            while (isset($lines[$line + 1]) && $lines[$line + 1][1] <= $start) {
                $line++;
            }

            $endLine = $line;

            while (isset($lines[$endLine + 1]) && $lines[$endLine + 1][1] < $position) {
                $endLine++;
            }

            $before = substr($lines[$line][0], 0, $start - $lines[$line][1]);
            $after = substr($lines[$endLine][0], $position - $lines[$endLine][1]);

            // Any content before or after the comment makes it inline, matching ESLint.
            if (! $this->isBlank($before) || ! $this->isBlank($after)) {
                continue;
            }

            $continuesGroup = $previousCommentEndLine !== null && $line === $previousCommentEndLine + 1;
            $previousCommentEndLine = $endLine;

            if ($continuesGroup || ($line > 0 && $this->isBlank($lines[$line - 1][0]))) {
                continue;
            }

            $offsets[] = $lines[$line][1];
        }

        return $offsets;
    }

    private function isBlank(string $text): bool
    {

        // Include Unicode spaces and BOM, as JavaScript's trim() does.
        return preg_match('/^[\s\p{Z}\x{FEFF}]*$/uD', $text) === 1;
    }
}
