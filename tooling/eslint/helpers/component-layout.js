// Adapted from eslint-old's one-line and multiline helpers. Only change layout
// when attribute values, expressions, comments, and whitespace-sensitive text survive.
function preservesWhitespace(node) {
    for (let current = node; current?.type === 'VElement'; current = current.parent) {
        if (['pre', 'textarea', 'script', 'style'].includes(current.rawName)
            || current.startTag.attributes.some((attribute) => attribute.directive && attribute.key.name.name === 'pre')) {
            return true;
        }
    }

    return false;
}

function fixOneLine(fixer, sourceCode, node) {
    if (preservesWhitespace(node)) return null;

    const tokenStore = sourceCode.parserServices.getTemplateBodyTokenStore?.();
    if (!tokenStore) return null;
    const attributes = node.startTag.attributes.map((attribute) => sourceCode.getText(attribute));
    if (attributes.some((attribute) => /[\r\n]/.test(attribute))
        || node.children.some((child) => child.type !== 'VText'
            && (child.type !== 'VExpressionContainer' || child.loc.start.line !== child.loc.end.line))
        || tokenStore.getTokens(node, {includeComments: true}).some((token) => token.type === 'HTMLComment')) {
        return null;
    }

    const opening = `<${node.rawName}${attributes.length ? ` ${attributes.join(' ')}` : ''}${node.startTag.selfClosing ? ' />' : '>'}`;
    if (!node.endTag) {
        return node.startTag.selfClosing ? fixer.replaceText(node.startTag, opening) : null;
    }

    let content = node.children.map((child) => child.type === 'VText'
        ? sourceCode.getText(child).replace(/[\t \r\n]+/g, ' ')
        : sourceCode.getText(child)).join('');

    // Remove newline padding for standalone elements, as in <Description>\ntext\n</Description>.
    // Inline elements keep boundary spaces so adjacent words are not joined.
    const before = sourceCode.lines[node.loc.start.line - 1].slice(0, node.loc.start.column);
    const after = sourceCode.lines[node.loc.end.line - 1].slice(node.loc.end.column);
    if (!before.trim() && !after.trim()) {
        const first = node.children[0];
        const last = node.children.at(-1);
        if (first?.type === 'VText' && /^[\t ]*[\r\n]/.test(sourceCode.getText(first))) content = content.trimStart();
        if (last?.type === 'VText' && /[\r\n][\t ]*$/.test(sourceCode.getText(last))) content = content.trimEnd();
    }
    if (!content.trim()) content = '';

    return [
        fixer.replaceText(node.startTag, opening),
        fixer.replaceTextRange([node.startTag.range[1], node.endTag.range[0]], content),
        fixer.replaceText(node.endTag, sourceCode.getText(node.endTag).replace(/[\t \r\n]+(?=>)/g, '')),
    ];
}

function checkMultiLine(context, node) {
    if (!node.startTag.selfClosing && !node.endTag) return;

    const sourceCode = context.sourceCode;
    const content = node.endTag ? sourceCode.text.slice(node.startTag.range[1], node.endTag.range[0]) : '';
    const leadingNewline = /^[\t ]*(?:\r\n|\r|\n)/.test(content);
    const trailingNewline = /(?:\r\n|\r|\n)[\t ]*$/.test(content);
    if (leadingNewline && trailingNewline) return;

    context.report({
        loc: node.loc,
        messageId: 'multiLine',
        data: {element: node.rawName},
        fix(fixer) {
            if (preservesWhitespace(node)) return null;

            const newline = sourceCode.text.includes('\r\n') ? '\r\n' : '\n';
            const indent = sourceCode.lines[node.loc.start.line - 1].match(/^[\t ]*/)[0];
            const parentIndent = node.parent?.type === 'VElement'
                ? sourceCode.lines[node.parent.loc.start.line - 1].match(/^[\t ]*/)[0]
                : '';
            const indentUnit = indent.startsWith(parentIndent) && indent.length > parentIndent.length
                ? indent.slice(parentIndent.length)
                : indent.includes('\t') ? '\t' : '    ';

            if (node.startTag.selfClosing) {
                const ending = sourceCode.getText(node.startTag).match(/[\t ]*\/>$/);
                if (!ending) return null;
                return fixer.replaceTextRange(
                    [node.startTag.range[1] - ending[0].length, node.startTag.range[1]],
                    `>${newline}${indent}</${node.rawName}>`,
                );
            }

            const start = node.startTag.range[1];
            const end = node.endTag.range[0];
            if (!content.trim()) return fixer.replaceTextRange([start, end], `${newline}${indent}`);

            const fixes = [];
            if (!leadingNewline) {
                const spaces = content.match(/^[\t ]*/)[0].length;
                fixes.push(fixer.replaceTextRange([start, start + spaces], `${newline}${indent}${indentUnit}`));
            }
            if (!trailingNewline) {
                const spaces = content.match(/[\t ]*$/)[0].length;
                fixes.push(fixer.replaceTextRange([end - spaces, end], `${newline}${indent}`));
            }
            return fixes;
        },
    });
}

export function checkLayout(context, instance) {
    if (instance.entry.layout === 'multi-liner') {
        checkMultiLine(context, instance.node);
    } else if (instance.entry.layout === 'one-liner' && instance.node.loc.start.line !== instance.node.loc.end.line) {
        context.report({
            loc: instance.node.loc,
            messageId: 'oneLine',
            data: {element: instance.node.rawName},
            fix: (fixer) => fixOneLine(fixer, context.sourceCode, instance.node),
        });
    }
}
