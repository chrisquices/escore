import {walkStructure} from './component-structure.js';

const nativeTextElements = new Set([
    'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'del', 'div', 'em',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'i', 'ins', 'kbd', 'label', 'mark', 'p', 'q',
    's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var',
]);

function literalText(node) {
    const fragments = [];

    function collect(element) {
        if (element.startTag.attributes.some((attribute) => attribute.directive
            && ['text', 'html', 'if', 'else-if', 'else', 'for', 'show'].includes(attribute.key.name.name))) return false;

        for (const child of element.children) {
            if (child.type === 'VText') fragments.push(child.value);
            else if (child.type === 'VExpressionContainer') return false;
            else if (child.type === 'VElement') {
                // Custom components and slots can render unknown text.
                if (!nativeTextElements.has(child.rawName) || !collect(child)) return false;
                if (child.rawName === 'br') fragments.push(' ');
            }
        }

        return true;
    }

    if (!collect(node)) return undefined;
    return fragments.join('').replace(/\s+/g, ' ').trim() || undefined;
}

function sourceText(instance) {
    for (const candidate of walkStructure(instance)) {
        if (!candidate.entry.commentSource) continue;
        const text = literalText(candidate.node);
        if (text) return text.replace(/--|[<>]/g, (part) => (
            part === '--' ? '&#45;&#45;' : part === '<' ? '&lt;' : '&gt;'
        ));
    }

    return undefined;
}

export const meaningfulToken = {includeComments: true, filter: (token) => token.type !== 'HTMLWhitespace'};

export function standaloneComment(sourceCode, tokenStore, node) {
    const comment = tokenStore.getTokenBefore(node, meaningfulToken);
    if (comment?.type !== 'HTMLComment'
        || comment.loc.end.line !== node.loc.start.line - 1
        || sourceCode.lines[comment.loc.start.line - 1].slice(0, comment.loc.start.column).trim()
        || sourceCode.lines[comment.loc.end.line - 1].slice(comment.loc.end.column).trim()) return undefined;

    return comment;
}

export function checkComment(context, instance) {
    if (!instance.entry.comment) return;

    const sourceCode = context.sourceCode;
    const tokenStore = sourceCode.parserServices.getTemplateBodyTokenStore?.();
    if (!tokenStore) return;

    const node = instance.node;
    const comment = standaloneComment(sourceCode, tokenStore, node);
    if (!comment && !instance.entry.comment.required) return;
    const expected = sourceText(instance);

    // Authored comments are sufficient when no source can provide reliable text.
    if (comment?.value.trim()) {
        if (expected && comment.value.trim() !== expected) {
            context.report({
                loc: comment.loc,
                messageId: 'commentMismatch',
                data: {element: node.rawName, expected},
            });
        }
        return;
    }

    context.report({
        loc: node.startTag.loc,
        messageId: expected ? 'commentMissing' : 'commentManual',
        data: {element: node.rawName, expected},
        fix: expected ? (fixer) => {
            if (comment) return fixer.replaceText(comment, `<!-- ${expected} -->`);

            const prefix = sourceCode.lines[node.loc.start.line - 1].slice(0, node.loc.start.column);
            const indentation = prefix.match(/^[\t ]*/)[0];
            const newline = sourceCode.text.includes('\r\n') ? '\r\n' : '\n';
            const before = prefix.trim() ? newline + indentation : '';
            return fixer.insertTextBefore(node, `${before}<!-- ${expected} -->${newline}${indentation}`);
        } : undefined,
    });
}
