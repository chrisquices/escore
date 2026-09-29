export default {
    meta: {
        type: 'layout',
        docs: {description: 'Require a blank line above standalone JavaScript, TypeScript, and Vue template comments.'},
        fixable: 'whitespace',
        schema: [],
        messages: {
            missing: 'Add a blank line above this comment.',
        },
    },

    create(context) {
        const sourceCode = context.sourceCode;
        const newline = sourceCode.text.match(/\r\n|\n|\r/)?.[0] ?? '\n';

        return {
            'Program:exit'() {
                const document = sourceCode.parserServices.getDocumentFragment?.();
                const comments = [...sourceCode.getAllComments(), ...(document?.comments ?? [])];
                const checkedLines = new Set();

                for (const comment of comments) {
                    if (!['Line', 'Block', 'HTMLComment'].includes(comment.type)) continue;

                    const line = comment.loc.start.line;
                    const before = sourceCode.lines[line - 1].slice(0, comment.loc.start.column);
                    const after = sourceCode.lines[comment.loc.end.line - 1].slice(comment.loc.end.column);
                    if (before.trim() || after.trim()) continue;

                    // Vue can expose the same comment through multiple comment lists.
                    if (checkedLines.has(line)) continue;
                    checkedLines.add(line);
                    if (line > 1 && !sourceCode.lines[line - 2].trim()) continue;

                    context.report({
                        loc: comment.loc,
                        messageId: 'missing',
                        fix(fixer) {
                            const start = sourceCode.getIndexFromLoc({line, column: 0});
                            return fixer.insertTextBeforeRange([start, start], newline);
                        },
                    });
                }
            },
        };
    },
};
