import {meaningfulToken} from './component-comments.js';

export function checkSpacing(context, instance) {
    const checkEntries = instance.entries && !instance.outOfOrder && !instance.unexpected.length && !instance.choices.length;
    if (!checkEntries && !instance.entry.blankLineBetweenChildren && !instance.entry.noBlankLineBetweenChildren) return;

    const sourceCode = context.sourceCode;
    const tokenStore = sourceCode.parserServices.getTemplateBodyTokenStore?.();
    if (!tokenStore) return;

    const boundaries = [];
    let preservesWhitespace = false;
    if (instance.entry.blankLineBetweenChildren || instance.entry.noBlankLineBetweenChildren) {
        for (let node = instance.node; node?.type === 'VElement'; node = node.parent) {
            if (['pre', 'textarea', 'script', 'style'].includes(node.rawName)
                || node.startTag.attributes.some((attribute) => attribute.directive && attribute.key.name.name === 'pre')) {
                preservesWhitespace = true;
                break;
            }
        }
        const children = instance.node.children.filter((child) => child.type === 'VElement');
        for (let index = 1; index < children.length; index++) {
            boundaries.push({left: children[index - 1], right: children[index], betweenChildren: true, noBlankLine: instance.entry.noBlankLineBetweenChildren});
        }
    }
    // Explicit BlankLine entries depend on a valid match; the parent flag uses actual children.
    if (checkEntries && instance.entry.unordered) {
        const children = [...instance.children].sort((a, b) => a.node.range[0] - b.node.range[0]);
        for (const [index, child] of children.entries()) {
            if (child.entry.blankLine?.required) {
                boundaries.push({left: children[index - 1]?.node ?? instance.node.startTag, right: child.node});
            }
        }
    } else if (checkEntries) {
        const entries = instance.entries;
        const matched = new Map();
        for (const child of instance.children) {
            const group = matched.get(child.entry);
            if (group) group.last = child.node;
            else matched.set(child.entry, {first: child.node, last: child.node});
        }

        for (const [index, entry] of entries.entries()) {
            if (entry.name !== 'BlankLine' || !entry.required) continue;
            const before = entries.slice(0, index).reverse().find((candidate) => matched.has(candidate));
            const after = entries.slice(index + 1).find((candidate) => matched.has(candidate));
            // No trailing gap when all following optional components are absent.
            if (!before || !after) continue;

            boundaries.push({left: matched.get(before).last, right: matched.get(after).first});
        }
    }

    const checked = new Set();
    for (const {left, right, betweenChildren, noBlankLine} of boundaries) {
        if (checked.has(right)) continue;
        checked.add(right);

        if (noBlankLine) {
            const tokens = tokenStore.getTokensBetween(left, right, {includeComments: true});
            const comments = tokens.filter((token) => token.type === 'HTMLComment');
            const gaps = [];
            let start = left.range[1];
            for (const comment of comments) {
                gaps.push(sourceCode.text.slice(start, comment.range[0]));
                start = comment.range[1];
            }
            gaps.push(sourceCode.text.slice(start, right.range[0]));
            // Blank lines inside a comment are its content, not sibling spacing.
            if (!gaps.some((gap) => gap.split(/\r\n|\n|\r/).slice(1, -1).some((line) => /^[\t ]*$/.test(line)))) continue;

            const gap = sourceCode.text.slice(left.range[1], right.range[0]);
            const safe = !preservesWhitespace && /^[\t \r\n]*$/.test(gap)
                && tokens.every((token) => token.type === 'HTMLWhitespace');
            const newline = gap.match(/\r\n|\n|\r/)[0];
            const indentation = gap.split(/\r\n|\n|\r/).at(-1);
            context.report({
                loc: right.startTag.loc,
                messageId: 'noSpacing',
                data: {before: left.rawName, after: right.rawName},
                // Comments may require their own blank line; leave those conflicts for an explicit edit.
                fix: safe ? (fixer) => fixer.replaceTextRange([left.range[1], right.range[0]], newline + indentation) : undefined,
            });
            continue;
        }

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
        const safe = !betweenChildren || (!preservesWhitespace
            && tokenStore.getTokensBetween(left, right, {includeComments: true})
                .every((token) => ['HTMLWhitespace', 'HTMLComment'].includes(token.type)));
        context.report({
            loc: right.startTag.loc,
            messageId: instance.entry.unordered && !betweenChildren ? 'spacingAbove' : 'spacing',
            data: {before: left.rawName, after: right.rawName},
            fix: safe ? (fixer) => fixer.replaceTextRange([end - gap.length, end], newline + newline + indentation) : undefined,
        });
    }
}
