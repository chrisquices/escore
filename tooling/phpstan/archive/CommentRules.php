<?php

namespace Shared\Quality\PHPStan;

use PhpParser\Node;
use PHPStan\Analyser\Scope;
use PHPStan\Node\FileNode;
use PHPStan\Rules\Rule;
use PHPStan\Rules\RuleErrorBuilder;
use PhpToken;
use RuntimeException;

class CommentRules implements Rule
{
    public function getNodeType(): string
    {
        return FileNode::class;
    }

    public function processNode(Node $node, Scope $scope): array
    {
        return $this->requireBlankLineBeforeComments($scope->getFile());
    }

    private function requireBlankLineBeforeComments(string $file): array
    {
        $contents = file_get_contents($file);

        if ($contents === false) {
            throw new RuntimeException("Unable to read {$file}.");
        }

        $contents = str_replace(["\r\n", "\r"], "\n", $contents);
        $lines = explode("\n", $contents);
        $errors = [];
        $previousCommentEndLine = null;

        foreach (PhpToken::tokenize($contents) as $token) {
            if ($token->is(T_WHITESPACE)) {
                continue;
            }

            if (! $token->is([T_COMMENT, T_DOC_COMMENT])) {
                $previousCommentEndLine = null;

                continue;
            }

            $line = $token->line;
            $continuesCommentBlock = $previousCommentEndLine !== null
                && $line <= $previousCommentEndLine + 1;

            $previousCommentEndLine = $line + substr_count($token->text, "\n");
            $previousNewline = strrpos(substr($contents, 0, $token->pos), "\n");
            $lineStart = $previousNewline === false ? 0 : $previousNewline + 1;
            $isInlineComment = trim(substr($contents, $lineStart, $token->pos - $lineStart)) !== '';

            if ($line === 1
                || $isInlineComment
                || $continuesCommentBlock
                || trim($lines[$line - 2]) === '') {
                continue;
            }

            $errors[] = RuleErrorBuilder::message('Add a blank line before this comment.')
                ->identifier('general.blankLineBeforeComment')
                ->line($line)
                ->build();
        }

        return $errors;
    }
}
