import {matchesComponent, matchStructure, walkStructure} from './component-structure.js';

const commentBans = new WeakMap();

// Register active rules before visiting nodes, including bans owned by another component family.
export function registerCommentBans(sourceCode, root) {
    const entries = [root];
    for (const entry of entries) entries.push(...(entry.children ?? []));
    if (!entries.some((entry) => entry.noDirectChildComments)) return;

    if (!commentBans.has(sourceCode)) commentBans.set(sourceCode, new WeakSet());
    const bannedParents = commentBans.get(sourceCode);
    const nodes = [sourceCode.ast.templateBody].filter(Boolean);
    for (const node of nodes) {
        nodes.push(...node.children.filter((child) => child.type === 'VElement'));
        if (!matchesComponent(node, root.name)) continue;
        for (const instance of walkStructure(matchStructure(root, node))) {
            if (instance.entry.noDirectChildComments) bannedParents.add(instance.node);
        }
    }
}

const nativeTextElements = new Set([
    'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'del', 'div', 'em',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'i', 'ins', 'kbd', 'label', 'mark', 'p', 'q',
    's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var',
]);

function literalText(node, boundaries, owner) {
    const fragments = [];

    function collect(element) {
        if (boundaries.has(element)) return false;
        if (element.startTag.attributes.some((attribute) => attribute.directive
            && (['text', 'html'].includes(attribute.key.name.name)
                || (element !== owner && ['if', 'else-if', 'else', 'for', 'show'].includes(attribute.key.name.name))))) return false;

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

function attributeText(node, name, owner) {
    const camelize = (value) => value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const literalString = (expression) => expression?.type === 'Literal' && typeof expression.value === 'string'
        ? expression.value
        : expression?.type === 'TemplateLiteral' && !expression.expressions.length ? expression.quasis[0].value.cooked : undefined;
    const target = camelize(name);
    let text;

    for (const attribute of node.startTag.attributes) {
        if (!attribute.directive) {
            if (camelize(attribute.key.rawName) === target) text = attribute.value?.value;
            continue;
        }

        const directive = attribute.key.name.name;
        if (node !== owner && ['if', 'else-if', 'else', 'for', 'show'].includes(directive)) return undefined;
        if (!['bind', 'model'].includes(directive)) continue;

        const argument = attribute.key.argument;
        const key = !argument && directive === 'model' ? 'modelValue'
            : argument?.type === 'VIdentifier' ? argument.rawName : literalString(argument?.expression);
        // A spread or unknown key can replace an earlier attribute. Later explicit values remain usable.
        if (key === undefined) text = undefined;
        else if (camelize(key) === target) text = directive === 'bind' ? literalString(attribute.value?.expression) : undefined;
    }

    return text?.replace(/\s+/g, ' ').trim() || undefined;
}

function hasActiveComment(sourceCode, instance) {
    const comment = instance.entry.comment;
    if (!comment) return false;
    if (commentBans.get(sourceCode)?.has(instance.node.parent)) return false;
    if (!comment.notWithin.length) return true;

    for (let parent = instance.node.parent; parent; parent = parent.parent) {
        if (comment.notWithin.some((name) => matchesComponent(parent, name))) return false;
    }
    return true;
}

function sourceText(sourceCode, instance) {
    const candidates = [];
    const boundaries = new Set();
    const pending = [instance];
    while (pending.length) {
        const candidate = pending.pop();
        // An active declaration owns its subtree even when its comment is missing or optional.
        if (candidate !== instance && hasActiveComment(sourceCode, candidate)) {
            boundaries.add(candidate.node);
            continue;
        }
        candidates.push(candidate);
        pending.push(...[...candidate.children].reverse());
    }

    for (const candidate of candidates) {
        for (const source of candidate.entry.commentSources) {
            const text = source === 'comment-source' ? literalText(candidate.node, boundaries, instance.node)
                : attributeText(candidate.node, source.slice('comment-source:'.length), instance.node);
            if (text) return text;
        }
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
    const activeComment = hasActiveComment(context.sourceCode, instance);
    if (!activeComment && !instance.entry.noDirectChildComments) return;

    const sourceCode = context.sourceCode;
    const tokenStore = sourceCode.parserServices.getTemplateBodyTokenStore?.();
    if (!tokenStore) return;

    const node = instance.node;
    if (instance.entry.noDirectChildComments && node.endTag) {
        let preservesWhitespace = false;
        for (let parent = node; parent?.type === 'VElement'; parent = parent.parent) {
            if (['pre', 'textarea', 'script', 'style'].includes(parent.rawName)
                || parent.startTag.attributes.some((attribute) => attribute.directive && attribute.key.name.name === 'pre')) {
                preservesWhitespace = true;
                break;
            }
        }
        const children = node.children.filter((child) => child.type === 'VElement');
        for (const comment of tokenStore.getTokensBetween(node.startTag, node.endTag, {includeComments: true})) {
            if (comment.type !== 'HTMLComment' || children.some((child) => (
                child.range[0] <= comment.range[0] && comment.range[1] <= child.range[1]
            ))) continue;

            context.report({
                loc: comment.loc,
                messageId: 'directChildComment',
                data: {element: node.rawName},
                fix(fixer) {
                    const start = sourceCode.getIndexFromLoc({line: comment.loc.start.line, column: 0});
                    const before = sourceCode.text.slice(start, comment.range[0]);
                    const after = sourceCode.text.slice(comment.range[1]).match(/^[\t ]*(?:\r\n|\r|\n|$)/);
                    // Remove an entire standalone comment line; preserve text around inline comments.
                    return !preservesWhitespace && /^[\t ]*$/.test(before) && after
                        ? fixer.removeRange([start, comment.range[1] + after[0].length])
                        : fixer.remove(comment);
                },
            });
        }
    }
    if (!activeComment) return;

    const comment = standaloneComment(sourceCode, tokenStore, node);
    if (!comment && !instance.entry.comment.required) return;
    const fixedText = instance.entry.comment.text;
    const expected = (fixedText ?? sourceText(sourceCode, instance))?.replace(/--|[<>]/g, (part) => (
        part === '--' ? '&#45;&#45;' : part === '<' ? '&lt;' : '&gt;'
    ));

    // Authored comments are sufficient when no source can provide reliable text.
    if (comment?.value.trim()) {
        if (expected && comment.value.trim() !== expected) {
            context.report({
                loc: comment.loc,
                messageId: fixedText === undefined ? 'commentMismatch' : 'commentFixed',
                data: {element: node.rawName, expected},
                fix: fixedText === undefined ? undefined : (fixer) => fixer.replaceText(comment, `<!-- ${expected} -->`),
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
