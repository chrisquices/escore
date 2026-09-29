const supportedFlags = new Set(['required', 'optional', 'forbidden', 'repeatable', 'comment-source', 'one-liner', 'multi-liner', 'top-level', 'last-in-template']);
const specialNames = new Set(['Comment', 'BlankLine']);

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

    function compile(entries, path) {
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
            if (Object.keys(options).some((key) => !['flags', 'children'].includes(key))) {
                invalid(position, 'only flags and children are supported.');
            }
            if (!Array.isArray(options.flags) || options.flags.some((flag) => !supportedFlags.has(flag))
                || new Set(options.flags).size !== options.flags.length) {
                invalid(position, `flags must contain unique, supported values: ${[...supportedFlags].join(', ')}.`);
            }
            const required = options.flags.includes('required');
            const forbidden = options.flags.includes('forbidden');
            if (options.flags.filter((flag) => ['required', 'optional', 'forbidden'].includes(flag)).length !== 1) {
                invalid(position, 'choose exactly one of required, optional, or forbidden.');
            }
            if (forbidden && (specialNames.has(name) || options.flags.length !== 1 || 'children' in options)) {
                invalid(position, 'forbidden components cannot be Comment or BlankLine, declare children, or use other flags.');
            }
            if (options.flags.includes('one-liner') && options.flags.includes('multi-liner')) {
                invalid(position, 'one-liner and multi-liner cannot be used together.');
            }
            const layout = options.flags.find((flag) => flag === 'one-liner' || flag === 'multi-liner');
            const repeatable = options.flags.includes('repeatable');
            const topLevel = options.flags.includes('top-level');
            const lastInTemplate = options.flags.includes('last-in-template');
            const special = specialNames.has(name);
            if (special && (topLevel || lastInTemplate)) {
                invalid(position, `${name} cannot use template placement flags.`);
            }
            if (special && ('children' in options || options.flags.includes('comment-source') || layout || repeatable)) {
                invalid(position, `${name} cannot have children, be a comment-source, use layout flags, or be repeatable.`);
            }

            return {
                name,
                path: position,
                required,
                forbidden,
                repeatable,
                special,
                layout,
                topLevel,
                lastInTemplate,
                commentSource: options.flags.includes('comment-source'),
                children: 'children' in options ? compile(options.children, `${position}.${name}.children`) : null,
            };
        });

        for (const [index, entry] of compiled.entries()) {
            if (entry.name === 'Comment') {
                const target = compiled[index + 1];
                if (!target || target.special || target.forbidden) invalid(entry.path, 'Comment must immediately precede an allowed component entry.');
                target.comment = entry;
            }
            if (entry.name === 'BlankLine'
                && (!compiled.slice(0, index).some((item) => !item.special && !item.forbidden)
                    || !compiled.slice(index + 1).some((item) => !item.special && !item.forbidden))) {
                invalid(entry.path, 'BlankLine must have a component before and after it.');
            }
        }

        return compiled;
    }

    const entries = compile(structure, 'structure');
    const roots = entries.filter((entry) => !entry.special);
    if (roots.length !== 1) invalid('structure', 'declare exactly one root component, optionally preceded by Comment.');
    if (roots[0].forbidden) invalid(roots[0].path, 'the root component cannot be forbidden.');

    // A forbidden declaration bans the named component throughout the template.
    const declarations = new Map();
    const pending = [...roots];
    for (const entry of pending) {
        if (entry.special) continue;
        if (entry !== roots[0] && (entry.topLevel || entry.lastInTemplate)) {
            invalid(entry.path, 'top-level and last-in-template can only be declared on the root component.');
        }
        if (declarations.has(entry.name) && declarations.get(entry.name) !== entry.forbidden) {
            invalid(entry.path, `${entry.name} cannot be both allowed and forbidden.`);
        }
        declarations.set(entry.name, entry.forbidden);
        pending.push(...(entry.children ?? []));
    }

    return roots[0];
}

function meaningfulChildren(node) {
    return node.children.filter((child) => child.type !== 'VComment'
        && !(child.type === 'VText' && /^\s*$/.test(child.value)));
}

// Match sibling occurrences, not a global map keyed by component name.
// Matching independently of order allows order errors without false missing errors.
export function matchStructure(entry, node) {
    const instance = {entry, node, children: [], missing: [], unexpected: [], outOfOrder: false};
    if (entry.children === null) return instance;

    const expected = entry.children.filter((child) => !child.special && !child.forbidden);
    const actual = meaningfulChildren(node);
    const available = new Set(actual);

    for (const [index, child] of expected.entries()) {
        const candidates = actual.filter((candidate) => available.has(candidate) && matchesComponent(candidate, child.name));
        const requiredLater = expected.slice(index + 1).filter((later) => later.required && later.name === child.name).length;

        if (!candidates.length) {
            if (child.required) instance.missing.push(child);
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
            instance.children.push(matchStructure(child, candidate));
        }
    }

    instance.unexpected = [...available];
    instance.outOfOrder = instance.children.some((child, index, siblings) => index > 0
        && siblings[index - 1].node.range[0] > child.node.range[0]);

    return instance;
}

export function* walkStructure(instance) {
    yield instance;
    for (const child of instance.children) yield* walkStructure(child);
}
