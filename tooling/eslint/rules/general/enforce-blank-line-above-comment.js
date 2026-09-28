export default {
  meta: {
    type: 'layout',
    docs: { description: 'require a blank line above standalone JavaScript, TypeScript, and Vue template comments' },
    fixable: 'whitespace',
    schema: [],
    messages: { expected: 'Expected a blank line above this comment.' },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const newline = sourceCode.text.includes('\r\n') ? '\r\n' : '\n';

    return {
      'Program:exit'() {
        const documentFragment = sourceCode.parserServices.getDocumentFragment?.();
        const comments = [
          ...sourceCode.getAllComments(),
          ...(documentFragment?.comments ?? []),
        ];
        const seen = new Set();

        for (const comment of comments) {
          if (!['Line', 'Block', 'HTMLComment'].includes(comment.type)) continue;

          const key = comment.range.join(':');
          if (seen.has(key)) continue;
          seen.add(key);

          const lineIndex = comment.loc.start.line - 1;
          if (lineIndex === 0) continue;

          // Inline comments stay in place; an existing blank line is sufficient.
          const prefix = sourceCode.lines[lineIndex].slice(0, comment.loc.start.column);
          if (prefix.trim() || !sourceCode.lines[lineIndex - 1].trim()) continue;

          context.report({
            loc: comment.loc,
            messageId: 'expected',
            fix(fixer) {
              const lineStart = sourceCode.getIndexFromLoc({ line: comment.loc.start.line, column: 0 });
              return fixer.insertTextBeforeRange([lineStart, lineStart], newline);
            },
          });
        }
      },
    };
  },
};
