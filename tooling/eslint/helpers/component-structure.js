const supportedFlags = new Set(['required', 'optional', 'comment-source', 'one-liner', 'multi-liner']);
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
            if (required === options.flags.includes('optional')) {
                invalid(position, 'choose exactly one of required or optional.');
            }
            if (options.flags.includes('one-liner') && options.flags.includes('multi-liner')) {
                invalid(position, 'one-liner and multi-liner cannot be used together.');
            }
            const layout = options.flags.find((flag) => flag === 'one-liner' || flag === 'multi-liner');
            const special = specialNames.has(name);
            if (special && ('children' in options || options.flags.includes('comment-source') || layout)) {
                invalid(position, `${name} cannot have children, be a comment-source, or use layout flags.`);
            }

            return {
                name,
                path: position,
                required,
                special,
                layout,
                commentSource: options.flags.includes('comment-source'),
                children: 'children' in options ? compile(options.children, `${position}.${name}.children`) : null,
            };
        });

        for (const [index, entry] of compiled.entries()) {
            if (entry.name === 'Comment') {
                const target = compiled[index + 1];
                if (!target || target.special) invalid(entry.path, 'Comment must immediately precede a component entry.');
                target.comment = entry;
            }
            if (entry.name === 'BlankLine'
                && (!compiled.slice(0, index).some((item) => !item.special)
                    || !compiled.slice(index + 1).some((item) => !item.special))) {
                invalid(entry.path, 'BlankLine must have a component before and after it.');
            }
        }

        return compiled;
    }

    const entries = compile(structure, 'structure');
    const roots = entries.filter((entry) => !entry.special);
    if (roots.length !== 1) invalid('structure', 'declare exactly one root component, optionally preceded by Comment.');

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

    const expected = entry.children.filter((child) => !child.special);
    const actual = meaningfulChildren(node);
    const available = new Set(actual);

    for (const [index, child] of expected.entries()) {
        const candidates = actual.filter((candidate) => available.has(candidate) && matchesComponent(candidate, child.name));
        const requiredLater = expected.slice(index + 1).filter((later) => later.required && later.name === child.name).length;

        // Reserve occurrences for later required entries of the same name.
        if (!child.required && candidates.length <= requiredLater) continue;
        const candidate = candidates[0];
        if (!candidate) {
            if (child.required) instance.missing.push(child);
            continue;
        }

        available.delete(candidate);
        instance.children.push(matchStructure(child, candidate));
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
