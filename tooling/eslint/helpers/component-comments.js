import {matchesComponent, matchStructure, walkStructure} from './component-structure.js';
import {readAttributes} from './component-props.js';

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

function referencedComment(sourceCode, tokenStore, instance, matchers) {
    const reference = instance.entry.comment.from;
    const group = instance.groups.get(reference.scopePath);
    let scope = instance;
    if (reference.group) {
        while (scope.parent && scope.groups.get(reference.scopePath) === group) scope = scope.parent;
    } else {
        while (scope.parent && scope.entry.path !== reference.scopePath) scope = scope.parent;
    }
    const candidates = [...walkStructure(scope)].filter((candidate) => reference.paths.has(candidate.entry.path)
        && (!reference.group || candidate.groups.get(reference.scopePath) === group));
    const matcher = Object.hasOwn(matchers, reference.name) ? matchers[reference.name] : undefined;
    const matching = matcher ? matcher({sourceCode, instance, candidates, scope})
        : candidates.length === 1 ? candidates[0] : undefined;
    if (!matching || !candidates.includes(matching) || commentBans.get(sourceCode)?.has(matching.node.parent)) return undefined;
    const text = standaloneComment(sourceCode, tokenStore, matching.node)?.value.trim();
    // Copy authored text, but never propagate tooling directives into another component.
    return text && !/^(?:eslint(?:\b|-)|@(?:vue|ts)-)/.test(text) ? text : undefined;
}

// Families opt into column matching; ordinary comment references do not use table layout.
export function matchCommentByColumn({sourceCode, instance, candidates, scope}) {
    const reference = instance.entry.comment.from;

    function span(node, name) {
        const bindings = readAttributes(sourceCode, node);
        if (!bindings) return undefined;
        const attribute = [...bindings.attributes]
            .filter(([key]) => key.toLowerCase() === name)
            .map(([, value]) => value)
            .sort((left, right) => left.node.range[0] - right.node.range[0]).at(-1);
        if (!attribute) return bindings.uncertain ? undefined : 1;
        if (attribute.value == null) return 1;
        const value = typeof attribute.value === 'number' ? attribute.value
            : typeof attribute.value === 'string' && /^\d+$/.test(attribute.value) ? Number(attribute.value) : undefined;
        return Number.isSafeInteger(value) && value > 0 ? value : undefined;
    }

    function columns(cell) {
        const row = cell.parent;
        if (!row) return undefined;
        // Rowspans can shift later rows. Leave that layout for the agent instead of guessing.
        for (const previous of row.node.parent?.children ?? []) {
            if (previous === row.node) break;
            if (previous.type !== 'VElement') continue;
            if (!matchesComponent(previous, row.entry.name)
                || previous.children.some((child) => child.type === 'VElement' && span(child, 'rowspan') !== 1)) return undefined;
        }
        let start = 0;
        for (const sibling of row.node.children) {
            if (sibling.type === 'VText' && !sibling.value.trim()) continue;
            if (sibling.type === 'VComment' || sibling.type === 'VHTMLComment') continue;
            if (![instance.entry.name, reference.name].some((name) => matchesComponent(sibling, name))
                || sibling.startTag.attributes.some((attribute) => attribute.directive
                    && ['if', 'else-if', 'else', 'for', 'show'].includes(attribute.key.name.name))
                || span(sibling, 'rowspan') !== 1) return undefined;
            const width = span(sibling, 'colspan');
            if (!width || !Number.isSafeInteger(start + width)) return undefined;
            if (sibling === cell.node) return {start, end: start + width};
            start += width;
        }
        return undefined;
    }

    const target = columns(instance);
    if (!target) return undefined;
    const matching = [];
    for (const candidate of candidates) {
        // Conditional/repeated header cells or rows do not define a stable column map.
        for (let node = candidate.node; node && node !== scope.node; node = node.parent) {
            if (node.startTag?.attributes.some((attribute) => attribute.directive
                && ['if', 'else-if', 'else', 'for', 'show'].includes(attribute.key.name.name))) return undefined;
        }
        const source = columns(candidate);
        if (!source) return undefined;
        if (source.start < target.end && target.start < source.end) {
            if (source.start > target.start || source.end < target.end) return undefined;
            matching.push(candidate);
        }
    }
    return matching.length === 1 ? matching[0] : undefined;
}

export function checkComment(context, instance, matchers = {}) {
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
    const from = instance.entry.comment.from;
    const expected = from ? referencedComment(sourceCode, tokenStore, instance, matchers)
        : (fixedText ?? sourceText(sourceCode, instance))?.replace(/--|[<>]/g, (part) => (
        part === '--' ? '&#45;&#45;' : part === '<' ? '&lt;' : '&gt;'
    ));
    if (from && !expected) {
        context.report({
            loc: node.startTag.loc,
            messageId: 'commentReferenceUnavailable',
            data: {element: node.rawName, source: from.name},
        });
        return;
    }

    // Authored comments are sufficient when no source can provide reliable text.
    if (comment?.value.trim()) {
        if (expected && comment.value.trim() !== expected) {
            context.report({
                loc: comment.loc,
                messageId: from ? 'commentReferenceMismatch' : fixedText === undefined ? 'commentMismatch' : 'commentFixed',
                data: {element: node.rawName, expected, source: from?.name},
                fix: fixedText !== undefined || from ? (fixer) => fixer.replaceText(comment, `<!-- ${expected} -->`) : undefined,
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
