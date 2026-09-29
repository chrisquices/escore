import {meaningfulToken} from './component-comments.js';

export function checkSpacing(context, instance) {
    if (!instance.entry.children || instance.outOfOrder || instance.unexpected.length) return;

    const sourceCode = context.sourceCode;
    const tokenStore = sourceCode.parserServices.getTemplateBodyTokenStore?.();
    if (!tokenStore) return;

    const entries = instance.entry.children;
    const matched = new Map(instance.children.map((child) => [child.entry, child.node]));
    const checked = new Set();

    for (const [index, entry] of entries.entries()) {
        if (entry.name !== 'BlankLine' || !entry.required) continue;
        const before = entries.slice(0, index).reverse().find((candidate) => matched.has(candidate));
        const after = entries.slice(index + 1).find((candidate) => matched.has(candidate));
        // No trailing gap when all following optional components are absent.
        if (!before || !after) continue;

        const left = matched.get(before);
        const right = matched.get(after);
        if (checked.has(right)) continue;
        checked.add(right);

        let anchor = right;
        // Keep leading standalone comments attached to the following component.
        while (true) {
            const comment = tokenStore.getTokenBefore(anchor, meaningfulToken);
            if (comment?.type !== 'HTMLComment' || comment.range[0] < left.range[1]
                || comment.loc.end.line >= anchor.loc.start.line
                || sourceCode.lines[comment.loc.start.line - 1].slice(0, comment.loc.start.column).trim()
                || !/^\s*$/.test(sourceCode.text.slice(comment.range[1], anchor.range[0]))) break;
            anchor = comment;
        }

        const end = anchor.range[0];
        const gap = sourceCode.text.slice(left.range[1], end).match(/\s*$/)[0];
        if ((gap.match(/\r\n|\n|\r/g) ?? []).length === 2) continue;

        const newline = sourceCode.text.includes('\r\n') ? '\r\n' : '\n';
        const indentation = gap.split(/\r\n|\n|\r/).at(-1);
        context.report({
            loc: right.startTag.loc,
            messageId: 'spacing',
            data: {before: left.rawName, after: right.rawName},
            fix: (fixer) => fixer.replaceTextRange([end - gap.length, end], newline + newline + indentation),
        });
    }
}
