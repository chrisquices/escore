const supportedFlags = new Set(['required', 'optional', 'forbidden', 'repeatable', 'one-of', 'comment-source', 'one-liner', 'multi-liner', 'one-liner-attributes', 'multi-liner-attributes', 'self-closing', 'blank-line-between-children', 'no-blank-line-between-children', 'no-direct-child-comments', 'non-empty', 'unordered', 'top-level', 'last-in-template', 'once-per-file']);
const attributeCommentSource = /^comment-source:[a-zA-Z_][\w.:-]*$/;
const specialNames = new Set(['Comment', 'BlankLine']);
const attributeName = /^[a-zA-Z_][\w:-]*$/;
const attributeMatch = /^matches:([a-zA-Z_][\w-]*)\.([a-zA-Z_][\w:-]*)$/;

export function matchesComponent(node, name) {
    if (node?.type !== 'VElement') return false;

    const kebab = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

    // A native <button> must never satisfy a <Button> requirement.
    return node.rawName === name || (kebab.includes('-') && node.rawName === kebab);
}

export function compileStructure(structure) {
    function invalid(path, message) {
        throw new TypeError(`Invalid component structure at ${path}: ${message}`);
    }

    function compile(entries, path, unorderedChildren = false) {
        if (!Array.isArray(entries)) invalid(path, 'expected an array.');

        const compiled = entries.map((entry, index) => {
            const position = `${path}[${index}]`;
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)
                || Object.keys(entry).length !== 1) {
                invalid(position, 'each entry must contain exactly one name.');
            }

            const [name, options] = Object.entries(entry)[0];
            if (!name || !options || typeof options !== 'object' || Array.isArray(options)) {
                invalid(position, 'expected a name and an options object.');
            }
            if (Object.keys(options).some((key) => !['flags', 'children', 'attributes'].includes(key))) {
                invalid(position, 'only flags, children, and attributes are supported.');
            }
            if (!Array.isArray(options.flags) || options.flags.some((flag) => typeof flag !== 'string'
                || (!supportedFlags.has(flag) && !attributeCommentSource.test(flag) && !flag.startsWith('text:') && !flag.startsWith('not-within:') && !flag.startsWith('comment-from:')))
                || new Set(options.flags).size !== options.flags.length) {
                invalid(position, `flags must contain unique, supported values: ${[...supportedFlags].join(', ')}, comment-source:<attribute>, text:<content>, not-within:<component,...>, comment-from:<component>.`);
            }
            const textFlags = options.flags.filter((flag) => flag.startsWith('text:'));
            const text = textFlags[0]?.slice('text:'.length).trim();
            if (textFlags.length && (name !== 'Comment' || textFlags.length !== 1 || !text || /[\r\n]/.test(textFlags[0]))) {
                invalid(position, 'text:<content> is only allowed once on Comment, with nonempty, single-line text.');
            }
            const referenceFlags = options.flags.filter((flag) => flag.startsWith('comment-from:'));
            const referenceName = referenceFlags[0]?.slice('comment-from:'.length);
            if (referenceFlags.length && (name !== 'Comment' || referenceFlags.length !== 1 || !/^[a-zA-Z_][\w.-]*$/.test(referenceName))) {
                invalid(position, 'comment-from:<component> is only allowed once on Comment, with a single component name.');
            }
            if (referenceFlags.length && textFlags.length) invalid(position, 'comment-from and text cannot be used together.');
            const from = referenceName ? {name: referenceName} : undefined;
            const notWithinFlags = options.flags.filter((flag) => flag.startsWith('not-within:'));
            const notWithin = notWithinFlags[0]?.slice('not-within:'.length).split(',').map((name) => name.trim()) ?? [];
            if (notWithinFlags.length && (name !== 'Comment' || notWithinFlags.length !== 1
                || /[\r\n]/.test(notWithinFlags[0]) || notWithin.some((name) => !/^[a-zA-Z_][\w.-]*$/.test(name))
                || new Set(notWithin).size !== notWithin.length)) {
                invalid(position, 'not-within:<component,...> is only allowed once on Comment, with unique comma-separated component names.');
            }
            const required = options.flags.includes('required');
            const forbidden = options.flags.includes('forbidden');
            const group = name === 'Group';
            const oneOf = options.flags.includes('one-of');
            if (options.flags.filter((flag) => ['required', 'optional', 'forbidden'].includes(flag)).length !== 1) {
                invalid(position, 'choose exactly one of required, optional, or forbidden.');
            }
            if (forbidden && (specialNames.has(name) || group || options.flags.length !== 1 || 'children' in options)) {
                invalid(position, 'forbidden components cannot be Comment or BlankLine, declare children, or use other flags.');
            }
            if (options.flags.includes('one-liner') && options.flags.includes('multi-liner')) {
                invalid(position, 'one-liner and multi-liner cannot be used together.');
            }
            const layout = options.flags.find((flag) => flag === 'one-liner' || flag === 'multi-liner');
            const attributeLayout = options.flags.find((flag) => flag === 'one-liner-attributes' || flag === 'multi-liner-attributes');
            if (options.flags.includes('one-liner-attributes') && options.flags.includes('multi-liner-attributes')) {
                invalid(position, 'one-liner-attributes and multi-liner-attributes cannot be used together.');
            }
            if (layout === 'one-liner' && attributeLayout === 'multi-liner-attributes') {
                invalid(position, 'one-liner and multi-liner-attributes cannot be used together.');
            }
            const nonEmpty = options.flags.includes('non-empty');
            const selfClosing = options.flags.includes('self-closing');
            const blankLineBetweenChildren = options.flags.includes('blank-line-between-children');
            const noBlankLineBetweenChildren = options.flags.includes('no-blank-line-between-children');
            const noDirectChildComments = options.flags.includes('no-direct-child-comments');
            const unordered = options.flags.includes('unordered');
            const repeatable = options.flags.includes('repeatable');
            const topLevel = options.flags.includes('top-level');
            const lastInTemplate = options.flags.includes('last-in-template');
            const oncePerFile = options.flags.includes('once-per-file');
            const commentSources = options.flags.filter((flag) => flag === 'comment-source' || flag.startsWith('comment-source:'));
            const special = specialNames.has(name);
            if (oncePerFile && (special || group)) {
                invalid(position, 'once-per-file can only be declared on a component.');
            }
            const attributes = [];
            if ('attributes' in options) {
                if (special || group || forbidden) invalid(position, 'attributes can only be declared on an allowed component.');
                if (!options.attributes || typeof options.attributes !== 'object' || Array.isArray(options.attributes)) {
                    invalid(position, 'attributes must be an object mapping attribute names to constraint arrays.');
                }
                const names = new Set();
                for (const [name, constraints] of Object.entries(options.attributes)) {
                    const normalized = name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
                    if (!attributeName.test(name) || names.has(normalized)) invalid(position, 'attribute names must be valid and unique, including camelCase/kebab-case aliases.');
                    names.add(normalized);
                    if (!Array.isArray(constraints) || !constraints.length || new Set(constraints).size !== constraints.length
                        || constraints.some((flag) => typeof flag !== 'string' || !(flag === 'non-empty' || attributeMatch.test(flag)
                            || (flag.startsWith('value:') && flag.slice(6).trim() && !/[\r\n]/.test(flag))))) {
                        invalid(position, `constraints for ${name} must be unique values: non-empty, value:<text>, matches:<Component>.<attribute>.`);
                    }
                    const values = constraints.filter((flag) => flag.startsWith('value:'));
                    const matches = constraints.filter((flag) => flag.startsWith('matches:'));
                    if (values.length > 1 || matches.length > 1) invalid(position, `declare at most one value and one matches constraint for ${name}.`);
                    const match = matches[0]?.match(attributeMatch);
                    attributes.push({name, nonEmpty: constraints.includes('non-empty'), value: values[0]?.slice(6),
                        match: match ? {name: match[1], attribute: match[2]} : undefined});
                }
            }
            if (blankLineBetweenChildren && (special || group)) {
                invalid(position, 'blank-line-between-children can only be declared on a component.');
            }
            for (const flag of ['no-blank-line-between-children', 'no-direct-child-comments']) {
                if (options.flags.includes(flag) && (special || group)) {
                    invalid(position, `${flag} can only be declared on a component.`);
                }
            }
            if (blankLineBetweenChildren && noBlankLineBetweenChildren) {
                invalid(position, 'blank-line-between-children and no-blank-line-between-children cannot be used together.');
            }
            if (blankLineBetweenChildren && (selfClosing || layout === 'one-liner')) {
                invalid(position, 'blank-line-between-children cannot be combined with self-closing or one-liner.');
            }
            if (selfClosing && (special || group)) {
                invalid(position, 'self-closing can only be declared on a component.');
            }
            if (selfClosing && (nonEmpty || layout === 'multi-liner')) {
                invalid(position, 'self-closing cannot be combined with non-empty or multi-liner.');
            }
            if (nonEmpty && (special || group)) {
                invalid(position, 'non-empty can only be declared on a component.');
            }
            if (unordered && (special || group)) {
                invalid(position, 'unordered can only be declared on a component.');
            }
            if (special && (topLevel || lastInTemplate)) {
                invalid(position, `${name} cannot use template placement flags.`);
            }
            if (special && ('children' in options || commentSources.length || layout || attributeLayout || repeatable)) {
                invalid(position, `${name} cannot have children, be a comment-source, use layout flags, or be repeatable.`);
            }
            if (oneOf && !group) invalid(position, 'one-of can only be declared on Group.');
            if (group && (layout || attributeLayout || commentSources.length || topLevel || lastInTemplate || (oneOf && repeatable))) {
                invalid(position, 'Group supports required or optional, with either repeatable or one-of.');
            }
            const children = 'children' in options ? compile(options.children, `${position}.${name}.children`, unordered) : null;
            const directEntries = children?.flatMap((child) => child.group ? child.children : [child]) ?? [];
            if (noBlankLineBetweenChildren && directEntries.some((child) => child.name === 'BlankLine' && child.required)) {
                invalid(position, 'no-blank-line-between-children cannot be combined with required BlankLine entries at the same child level.');
            }
            if (noDirectChildComments && directEntries.some((child) => child.name === 'Comment' && child.required
                && !child.notWithin.some((ancestor) => matchesComponent({type: 'VElement', rawName: name}, ancestor)))) {
                invalid(position, 'no-direct-child-comments cannot be combined with required Comment entries at the same child level; remove the requirement or exclude this parent with not-within.');
            }
            if (selfClosing && children?.length) {
                invalid(position, 'self-closing cannot declare child entries; omit children or use an empty array.');
            }
            if (unordered) {
                if (!children?.length || children.some((child) => child.group)) {
                    invalid(position, 'unordered requires declared children without Group entries.');
                }
                const names = children.filter((child) => !child.special).map((child) => child.name);
                if (new Set(names).size !== names.length) {
                    invalid(position, 'unordered children must use unique component names; use repeatable for multiple occurrences.');
                }
            }
            if (group) {
                if (!children?.some((child) => !child.special && child.required)) {
                    invalid(position, 'Group must contain at least one required component.');
                }
                if (children.some((child) => child.group || child.forbidden || child.repeatable)) {
                    invalid(position, 'Group members cannot themselves be Group, forbidden, or repeatable; put nested patterns inside a component.');
                }
                if (oneOf && children.some((child) => child.special || !child.required)) {
                    invalid(position, 'one-of Group children must be required component alternatives.');
                }
            }

            return {
                name,
                path: position,
                required,
                forbidden,
                repeatable,
                special,
                group,
                oneOf,
                layout,
                attributeLayout,
                selfClosing,
                blankLineBetweenChildren,
                noBlankLineBetweenChildren,
                noDirectChildComments,
                nonEmpty,
                unordered,
                topLevel,
                lastInTemplate,
                oncePerFile,
                commentSources,
                text,
                from,
                notWithin,
                attributes,
                children,
            };
        });

        for (const [index, entry] of compiled.entries()) {
            if (entry.name === 'Comment') {
                const target = compiled[index + 1];
                if (!target || target.special || target.group || target.forbidden) invalid(entry.path, 'Comment must immediately precede an allowed component entry.');
                target.comment = entry;
            }
            if (entry.name !== 'BlankLine') continue;
            if (unorderedChildren) {
                // Like Comment, spacing belongs to each occurrence of the following component.
                const target = compiled[index + (compiled[index + 1]?.name === 'Comment' ? 2 : 1)];
                if (!target || target.special || target.group || target.forbidden) {
                    invalid(entry.path, 'BlankLine in unordered children must precede an allowed component, optionally with Comment between them.');
                }
                target.blankLine = entry;
            } else if (!compiled.slice(0, index).some((item) => !item.special && !item.forbidden)
                || !compiled.slice(index + 1).some((item) => !item.special && !item.forbidden)) {
                invalid(entry.path, 'BlankLine must have a component before and after it.');
            }
        }

        return compiled;
    }

    const entries = compile(structure, 'structure');
    const roots = entries.filter((entry) => !entry.special);
    if (roots.length !== 1) invalid('structure', 'declare exactly one root component, optionally preceded by Comment.');
    if (roots[0].group) invalid(roots[0].path, 'Group must be inside a component; it does not create an element.');
    if (roots[0].forbidden) invalid(roots[0].path, 'the root component cannot be forbidden.');

    // A forbidden declaration bans the named component throughout the template.
    const declarations = new Map();
    const pending = [...roots];
    for (const entry of pending) {
        if (entry.special) continue;
        if (entry.group) {
            pending.push(...entry.children);
            continue;
        }
        if (entry !== roots[0] && (entry.topLevel || entry.lastInTemplate)) {
            invalid(entry.path, 'top-level and last-in-template can only be declared on the root component.');
        }
        if (declarations.has(entry.name) && declarations.get(entry.name) !== entry.forbidden) {
            invalid(entry.path, `${entry.name} cannot be both allowed and forbidden.`);
        }
        declarations.set(entry.name, entry.forbidden);
        pending.push(...(entry.children ?? []));
    }

    // Resolve references by declaration, so a missing target cannot fall back to another occurrence.
    function descendants(entry) {
        return [entry, ...(entry.children ?? []).flatMap(descendants)];
    }
    function resolveReferences(entry, ancestors = []) {
        for (const attribute of entry.attributes) {
            if (!attribute.match) continue;
            const target = attribute.match;
            for (const scope of [entry, ...ancestors]) {
                const targets = descendants(scope).filter((candidate) => !candidate.special && !candidate.group && !candidate.forbidden && candidate.name === target.name);
                if (!targets.length) continue;
                Object.assign(target, {scopePath: scope.path, group: scope.group, paths: new Set(targets.map((candidate) => candidate.path))});
                break;
            }
            if (!target.scopePath) invalid(entry.path, `matches:${target.name}.${target.attribute} has no allowed target in this structure.`);
        }
        const reference = entry.comment?.from;
        if (reference) {
            for (const scope of [entry, ...ancestors]) {
                const targets = descendants(scope).filter((candidate) => candidate !== entry
                    && !candidate.special && !candidate.group && !candidate.forbidden && candidate.name === reference.name);
                if (!targets.length) continue;
                if (targets.some((target) => target.comment?.from)) {
                    invalid(entry.comment.path, 'comment-from cannot copy from another comment-from declaration.');
                }
                Object.assign(reference, {scopePath: scope.path, group: scope.group, paths: new Set(targets.map((target) => target.path))});
                break;
            }
            if (!reference.scopePath) invalid(entry.comment.path, `comment-from:${reference.name} has no allowed source in this structure.`);
        }
        for (const child of entry.children ?? []) resolveReferences(child, [entry, ...ancestors]);
    }
    resolveReferences(roots[0]);
    return roots[0];
}

function meaningfulChildren(node) {
    return node.children.filter((child) => child.type !== 'VComment' && child.type !== 'VHTMLComment'
        && !(child.type === 'VText' && /^\s*$/.test(child.value)));
}

// Expand transparent sibling patterns per parent, keeping each occurrence distinct.
function expandGroups(entries, actual) {
    if (!entries.some((entry) => entry.group)) return {entries, choices: []};

    const remaining = new Map();
    for (const entry of entries.flatMap((entry) => entry.group ? entry.children : [entry])) {
        if (!entry.special && !remaining.has(entry.name)) {
            remaining.set(entry.name, actual.filter((node) => matchesComponent(node, entry.name)).length);
        }
    }
    const minimum = (entries, name, consuming = [name]) => entries.reduce((count, entry) => {
        if (!entry.required || entry.special) return count;
        if (!entry.group) return count + Number(entry.name === name);
        if (!entry.oneOf) return count + minimum(entry.children, name, consuming);
        const selected = entry.children.find((child) => !consuming.includes(child.name) && (remaining.get(child.name) ?? 0) > 0)
            ?? entry.children.find((child) => (remaining.get(child.name) ?? 0) > 0) ?? entry.children[0];
        return count + Number(selected.name === name);
    }, 0);
    const expanded = [];
    const choices = [];

    for (const [index, entry] of entries.entries()) {
        const later = entries.slice(index + 1);
        if (!entry.group) {
            expanded.push(entry);
            if (!entry.special && !entry.forbidden) {
                const count = remaining.get(entry.name) ?? 0;
                const consumed = entry.repeatable ? Math.max(entry.required ? 1 : 0, count - minimum(later, entry.name)) : 1;
                remaining.set(entry.name, Math.max(0, count - consumed));
            }
            continue;
        }

        if (entry.oneOf) {
            const selected = entry.required
                ? entry.children.find((child) => (remaining.get(child.name) ?? 0) > 0) ?? entry.children[0]
                : undefined;
            const groupScope = {path: entry.path, token: {}};
            const alternatives = entry.children.map((child) => ({...child, groupScope, required: child === selected, alternative: true}));
            expanded.push(...alternatives);
            choices.push({entry, alternatives});
            for (const child of alternatives) remaining.set(child.name, Math.max(0, (remaining.get(child.name) ?? 0) - 1));
            continue;
        }

        const occurrences = new Map();
        for (const child of entry.children) {
            if (!child.special) occurrences.set(child.name, (occurrences.get(child.name) ?? 0) + 1);
        }
        let repetitions = entry.required ? 1 : 0;
        for (const [name, count] of occurrences) {
            repetitions = Math.max(repetitions, Math.ceil(((remaining.get(name) ?? 0) - minimum(later, name, [...occurrences.keys()])) / count));
        }
        if (!entry.repeatable) repetitions = Math.min(1, repetitions);
        for (let repetition = 0; repetition < repetitions; repetition++) {
            const groupScope = {path: entry.path, token: {}};
            for (const child of entry.children) {
                expanded.push({...child, groupScope});
                if (!child.special) remaining.set(child.name, Math.max(0, (remaining.get(child.name) ?? 0) - 1));
            }
        }
    }

    return {entries: expanded, choices};
}

// Match sibling occurrences, not a global map keyed by component name.
// Matching independently of order allows order errors without false missing errors.
export function matchStructure(entry, node, parent = null) {
    const actual = meaningfulChildren(node);
    const groups = new Map(parent?.groups);
    if (entry.groupScope) groups.set(entry.groupScope.path, entry.groupScope.token);
    const instance = {entry, node, parent, groups, hasContent: actual.length > 0, entries: entry.children, children: [], missing: [], choices: [], unexpected: [], outOfOrder: false};
    if (entry.children === null) return instance;

    const expanded = expandGroups(entry.children, actual);
    instance.entries = expanded.entries;
    const expected = instance.entries.filter((child) => !child.special && !child.forbidden);
    const available = new Set(actual);

    for (const [index, child] of expected.entries()) {
        const candidates = actual.filter((candidate) => available.has(candidate) && matchesComponent(candidate, child.name));
        const requiredLater = expected.slice(index + 1).filter((later) => later.required && later.name === child.name).length;

        if (!candidates.length) {
            if (child.required && !child.alternative) instance.missing.push(child);
            continue;
        }

        // Each later required entry needs at least one occurrence, even if repeatable.
        const minimum = child.required ? 1 : 0;
        let count = Math.max(minimum, candidates.length - requiredLater);
        if (!child.repeatable) count = Math.min(count, 1);

        // A declared separator distinguishes groups that reuse the same name.
        const nextSameName = expected.findIndex((later, laterIndex) => laterIndex > index && later.name === child.name);
        if (nextSameName > index + 1) {
            const between = expected.slice(index + 1, nextSameName);
            const boundary = actual.find((candidate) => available.has(candidate)
                && between.some((separator) => matchesComponent(candidate, separator.name)));
            if (boundary) {
                const beforeBoundary = candidates.filter((candidate) => candidate.range[0] < boundary.range[0]).length;
                count = Math.min(count, Math.max(minimum, beforeBoundary));
            }
        }

        for (const candidate of candidates.slice(0, count)) {
            available.delete(candidate);
            instance.children.push(matchStructure(child, candidate, instance));
        }
    }

    instance.unexpected = [...available];
    for (const choice of expanded.choices) {
        const members = instance.children.filter((child) => choice.alternatives.includes(child.entry));
        if (members.length > 1 || (choice.entry.required && !members.length)) instance.choices.push({...choice, members});
    }
    instance.outOfOrder = !entry.unordered && instance.children.some((child, index, siblings) => index > 0
        && siblings[index - 1].node.range[0] > child.node.range[0]);

    return instance;
}

export function* walkStructure(instance) {
    yield instance;
    for (const child of instance.children) yield* walkStructure(child);
}
