import {compileStructure, matchesComponent, matchStructure, walkStructure} from './component-structure.js';
import {checkComment} from './component-comments.js';
import {checkSpacing} from './component-spacing.js';
import {checkLayout} from './component-layout.js';
import {checkProps} from './component-props.js';

// One definition produces independently configurable rules for each concern.
export default function createComponentRules(structure, {forbiddenMessage, propsScope = 'all'} = {}) {
    if (!['all', 'root', 'family'].includes(propsScope)) throw new TypeError('propsScope must be all, root, or family.');
    const root = compileStructure(structure);
    const family = root.name.toLowerCase();
    const analyses = new WeakMap();
    const allowedParents = new Map();
    const forbidden = new Set();
    const pending = [root];

    for (const parent of pending) {
        for (const child of parent.children ?? []) {
            if (child.special) continue;
            if (child.group) {
                pending.push({...parent, children: child.children});
                continue;
            }
            if (child.forbidden) {
                forbidden.add(child.name);
                continue;
            }
            pending.push(child);

            // Family children follow the root's name; shared components stay usable elsewhere.
            // The root itself can appear anywhere, including inside another family instance.
            if (child.name === root.name || !child.name.startsWith(root.name)) continue;

            if (!allowedParents.has(child.name)) allowedParents.set(child.name, new Set());
            allowedParents.get(child.name).add(parent.name);
        }
    }

    function misplacedParents(node) {
        for (const [name, parents] of allowedParents) {
            if (!matchesComponent(node, name)) continue;
            if (![...parents].some((parent) => matchesComponent(node.parent, parent))) return parents;
            break;
        }
    }

    function createRule(description, messages, check, {
        fixable,
        type = fixable === 'whitespace' ? 'layout' : 'problem',
        checkElement,
    } = {}) {
        return {
            meta: {
                type,
                docs: {description},
                schema: [],
                messages,
                ...(fixable ? {fixable} : {}),
            },
            create(context) {
                const sourceCode = context.sourceCode;
                const services = sourceCode.parserServices;
                if (!services.defineTemplateBodyVisitor) return {};
                if (!analyses.has(sourceCode)) analyses.set(sourceCode, new WeakMap());
                const instances = analyses.get(sourceCode);

                return services.defineTemplateBodyVisitor({
                    VElement(node) {
                        checkElement?.(context, node);
                        if (!matchesComponent(node, root.name)) return;
                        if (!instances.has(node)) instances.set(node, matchStructure(root, node));
                        for (const instance of walkStructure(instances.get(node))) check(context, instance);
                    },
                });
            },
        };
    }

    return {
        [`${family}-must-have-valid-props`]: createRule(
            `Validate ${root.name} family props against their component source.`,
            {
                propMissing: 'Add the required {{ prop }} prop to <{{ element }}>; its component source requires it.',
                propValue: 'Set {{ prop }} on <{{ element }}> to {{ expected }}; received {{ actual }}.',
            },
            (context, instance) => {
                // A nested instance of this root receives its own complete rule pass.
                if (instance.entry !== root && instance.entry.name === root.name) return;
                if (propsScope === 'all' || instance.entry === root
                    || (propsScope === 'family' && instance.entry.name.startsWith(root.name))) checkProps(context, instance);
            },
        ),

        [`${family}-must-have-valid-comments`]: createRule(
            `Require valid comments within ${root.name}.`,
            {
                commentMissing: 'Add <!-- {{ expected }} --> on its own line immediately above <{{ element }}>.',
                commentManual: 'No comment source provides usable text. Add a standalone comment immediately above <{{ element }}> describing its purpose from the surrounding template.',
                commentMismatch: 'Replace the comment above <{{ element }}> with <!-- {{ expected }} --> to match the first usable comment source.',
                commentFixed: 'Replace the comment above <{{ element }}> with <!-- {{ expected }} -->.',
            },
            checkComment,
            {fixable: 'code'},
        ),

        [`${family}-must-follow-structure`]: createRule(
            `Enforce declared parents, required children, allowed children, and child order for ${root.name}.`,
            {
                forbidden: forbiddenMessage ?? 'Do not use <{{ element }}>; it is forbidden. Replace it while preserving its content and behavior.',
                topLevel: 'Move <{{ element }}> directly inside the root <template>, outside all wrappers. Preserve its conditions, bindings, and behavior.',
                lastInTemplate: 'Move <{{ element }}> after all other root <template> children. Order among <{{ root }}> instances is unrestricted. Preserve conditions and bindings.',
                misplaced: 'Move <{{ element }}> directly inside {{ expected }}; currently inside {{ actual }}. Preserve its content and bindings.',
                missing: 'Add <{{ child }}> directly inside <{{ parent }}>{{ placement }}. Preserve existing content and bindings.',
                empty: 'Add content inside <{{ element }}>: text, an interpolation, or a child element.',
                choiceMissing: 'Add exactly one of {{ expected }} directly inside <{{ parent }}>. Preserve existing content and bindings.',
                choiceMultiple: 'Keep exactly one of {{ expected }} directly inside <{{ parent }}>; found {{ actual }}. Preserve existing content and behavior.',
                unexpected: 'Unexpected {{ actual }} directly inside <{{ parent }}>. Move or remove it to match the declared children: {{ expected }}. Preserve existing behavior.',
                order: 'Reorder the direct children of <{{ parent }}> as: {{ expected }}. Preserve their content and bindings.',
            },
            (context, instance) => {
                if (instance.entry.nonEmpty && !instance.hasContent) {
                    context.report({
                        loc: instance.node.startTag.loc,
                        messageId: 'empty',
                        data: {element: instance.node.rawName},
                    });
                }
                for (const choice of instance.choices) {
                    context.report({
                        loc: instance.node.startTag.loc,
                        messageId: choice.members.length ? 'choiceMultiple' : 'choiceMissing',
                        data: {
                            parent: instance.node.rawName,
                            expected: choice.alternatives.map((entry) => `<${entry.name}>`).join(' or '),
                            actual: choice.members.map((member) => `<${member.node.rawName}>`).join(', '),
                        },
                    });
                }
                for (const child of instance.missing) {
                    const siblings = instance.entries;
                    const index = siblings.indexOf(child);
                    const before = instance.children.findLast((sibling) => siblings.indexOf(sibling.entry) < index);
                    const after = instance.children.find((sibling) => siblings.indexOf(sibling.entry) > index);
                    const anchor = before ?? after;
                    let placement = '';

                    if (anchor && !instance.outOfOrder && !instance.entry.unordered) {
                        placement = `, ${before ? 'after' : 'before'} <${anchor.node.rawName}>`;
                        if (instance.children.filter((sibling) => sibling.entry.name === anchor.entry.name).length > 1) {
                            placement += ` at line ${anchor.node.loc.start.line}, column ${anchor.node.loc.start.column + 1}`;
                        }
                    }

                    context.report({
                        loc: instance.node.startTag.loc,
                        messageId: 'missing',
                        data: {
                            parent: instance.node.rawName,
                            child: child.name,
                            placement,
                        },
                    });
                }
                for (const child of instance.unexpected) {
                    // The element visitor gives misplaced family children one specific repair.
                    if (misplacedParents(child) || [...forbidden].some((name) => matchesComponent(child, name))) continue;
                    context.report({
                        loc: child.startTag?.loc ?? child.loc,
                        messageId: 'unexpected',
                        data: {
                            parent: instance.node.rawName,
                            actual: child.type === 'VElement'
                                ? `<${child.rawName}>`
                                : 'text or an interpolation',
                            expected: instance.entries
                                .filter((entry) => !entry.special && !entry.forbidden)
                                .map((entry) => `<${entry.name}>`)
                                .join(', ') || 'none',
                        },
                    });
                }
                if (!instance.outOfOrder) return;

                context.report({
                    loc: instance.node.startTag.loc,
                    messageId: 'order',
                    data: {
                        parent: instance.node.rawName,
                        expected: instance.entries
                            .filter((entry) => !entry.special && !entry.forbidden)
                            .flatMap((entry) => {
                                const matches = instance.children.filter((child) => child.entry === entry);
                                return Array(Math.max(matches.length, entry.required ? 1 : 0)).fill(`<${entry.name}>`);
                            })
                            .join(', '),
                    },
                });
            },
            {
                checkElement(context, node) {
                    if (matchesComponent(node, root.name)) {
                        const templateBody = context.sourceCode.ast.templateBody;
                        if (node.parent !== templateBody) {
                            if (root.topLevel) context.report({
                                loc: node.startTag.loc,
                                messageId: 'topLevel',
                                data: {element: node.rawName},
                            });
                            return;
                        }

                        if (root.lastInTemplate && templateBody.children.slice(templateBody.children.indexOf(node) + 1).some((child) => (
                            child.type !== 'VComment' && child.type !== 'VHTMLComment'
                            && !(child.type === 'VText' && !child.value.trim())
                            && !matchesComponent(child, root.name)
                        ))) {
                            context.report({
                                loc: node.startTag.loc,
                                messageId: 'lastInTemplate',
                                data: {element: node.rawName, root: root.name},
                            });
                        }
                        return;
                    }

                    if ([...forbidden].some((name) => matchesComponent(node, name))) {
                        context.report({
                            loc: node.startTag.loc,
                            messageId: 'forbidden',
                            data: {element: node.rawName, root: root.name},
                        });
                        return;
                    }

                    const parents = misplacedParents(node);
                    if (!parents) return;

                    context.report({
                        loc: node.startTag.loc,
                        messageId: 'misplaced',
                        data: {
                            element: node.rawName,
                            expected: [...parents].map((parent) => `<${parent}>`).join(' or '),
                            actual: node.parent?.type === 'VElement'
                                ? `<${node.parent.rawName}>`
                                : 'the template root',
                        },
                    });
                },
            },
        ),

        [`${family}-must-have-required-blank-lines`]: createRule(
            `Enforce declared blank lines within ${root.name}.`,
            {
                spacing: 'Keep exactly one blank line between <{{ before }}> and <{{ after }}>, before any leading comments attached to <{{ after }}>.',
                spacingAbove: 'Keep exactly one blank line above <{{ after }}>, before any leading comments attached to it.',
            },
            checkSpacing,
            {fixable: 'whitespace'},
        ),

        [`${family}-must-follow-line-layout`]: createRule(
            `Enforce declared element and attribute line layouts within ${root.name}.`,
            {
                oneLine: 'Write the entire <{{ element }}> on one line, including attributes and content. Preserve text and bindings.',
                multiLine: 'Put the opening tag, content, and closing tag of <{{ element }}> on separate lines. Preserve text and bindings.',
                oneLineAttributes: 'Write the opening tag and attributes of <{{ element }}> on one line. Preserve values and child content.',
                multiLineAttributes: 'Put each attribute of <{{ element }}> on its own indented line below the tag name, with > or /> on a separate line. Preserve values and child content.',
                selfClosing: 'Write <{{ element }} /> as a self-closing tag. Preserve its attributes.',
                selfClosingContent: '<{{ element }}> must be self-closing. Resolve its child content or comments before converting it to <{{ element }} />.',
            },
            checkLayout,
            {fixable: 'code', type: 'layout'},
        ),
    };
}
