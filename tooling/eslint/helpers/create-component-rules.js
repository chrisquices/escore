import {compileStructure, matchesComponent, matchStructure, walkStructure} from './component-structure.js';
import {checkComment} from './component-comments.js';
import {checkSpacing} from './component-spacing.js';
import {checkLayout} from './component-layout.js';

// One definition produces independently configurable rules for each concern.
export default function createComponentRules(structure) {
    const root = compileStructure(structure);
    const family = root.name.toLowerCase();
    const analyses = new WeakMap();

    function createRule(description, messages, check, fixable, type = fixable === 'whitespace' ? 'layout' : 'problem') {
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
                        if (!matchesComponent(node, root.name)) return;
                        if (!instances.has(node)) instances.set(node, matchStructure(root, node));
                        for (const instance of walkStructure(instances.get(node))) check(context, instance);
                    },
                });
            },
        };
    }

    return {
        [`${family}-must-have-valid-comments`]: createRule(
            `Require valid comments within ${root.name}.`,
            {
                commentMissing: 'Add <!-- {{ expected }} --> on its own line immediately above <{{ element }}>.',
                commentManual: 'No comment source provides usable text. Add a standalone comment immediately above <{{ element }}> describing its purpose from the surrounding template.',
                commentMismatch: 'Replace the comment above <{{ element }}> with <!-- {{ expected }} --> to match the first usable comment source.',
            },
            checkComment,
            'code',
        ),

        [`${family}-must-have-required-children`]: createRule(
            `Require declared direct children within ${root.name}.`,
            {
                missing: 'Add the missing direct <{{ child }}> child inside <{{ parent }}> at structure position {{ position }}. Preserve existing content and bindings.',
            },
            (context, instance) => {
                for (const child of instance.missing) {
                    context.report({
                        loc: instance.node.startTag.loc,
                        messageId: 'missing',
                        data: {
                            parent: instance.node.rawName,
                            child: child.name,
                            position: child.path,
                        },
                    });
                }
            },
        ),

        [`${family}-must-not-have-extra-children`]: createRule(
            `Enforce allowed direct children within ${root.name}.`,
            {
                unexpected: 'Unexpected {{ actual }} directly inside <{{ parent }}>. Move or remove it to match the declared children: {{ expected }}. Preserve existing behavior.',
            },
            (context, instance) => {
                for (const child of instance.unexpected) {
                    context.report({
                        loc: child.startTag?.loc ?? child.loc,
                        messageId: 'unexpected',
                        data: {
                            parent: instance.node.rawName,
                            actual: child.type === 'VElement'
                                ? `<${child.rawName}>`
                                : 'text or an interpolation',
                            expected: instance.entry.children
                                .filter((entry) => !entry.special)
                                .map((entry) => `<${entry.name}>`)
                                .join(', ') || 'none',
                        },
                    });
                }
            },
        ),

        [`${family}-must-follow-child-order`]: createRule(
            `Enforce declared child order within ${root.name}.`,
            {
                order: 'Reorder the direct children of <{{ parent }}> as: {{ expected }}. Preserve their content and bindings.',
            },
            (context, instance) => {
                if (!instance.outOfOrder) return;

                context.report({
                    loc: instance.node.startTag.loc,
                    messageId: 'order',
                    data: {
                        parent: instance.node.rawName,
                        expected: instance.children
                            .map((child) => `<${child.entry.name}>`)
                            .join(', '),
                    },
                });
            },
        ),

        [`${family}-must-have-required-blank-lines`]: createRule(
            `Enforce declared blank lines within ${root.name}.`,
            {
                spacing: 'Keep exactly one blank line between <{{ before }}> and <{{ after }}>, before any leading comments attached to <{{ after }}>.',
            },
            checkSpacing,
            'whitespace',
        ),

        [`${family}-must-follow-line-layout`]: createRule(
            `Enforce one-liner and multi-liner flags within ${root.name}.`,
            {
                oneLine: 'Write the entire <{{ element }}> on one line, including attributes and content. Preserve text and bindings.',
                multiLine: 'Put the opening tag, content, and closing tag of <{{ element }}> on separate lines. Preserve text and bindings.',
            },
            checkLayout,
            'code',
            'layout',
        ),
    };
}
