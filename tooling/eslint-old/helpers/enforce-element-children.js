import { matchesStructureElement, structureChildren, structureVisitor } from './element-structure.js';

// Validate permitted direct children without requiring any of them to exist.
export default ({ structure, element }) => ({
  meta: {
    type: 'problem',
    docs: { description: `enforce the allowed direct children of ${element} within ${structure.root}` },
    schema: [],
    messages: {
      child: '{{ actual }} is not allowed directly inside <{{ element }}>. Allowed direct children: {{ allowed }}. Use the declared component structure without extra wrappers or loose text; preserve existing behavior when moving content.',
    },
  },

  create(context) {
    const allowed = structure.elements[element].children;

    return structureVisitor(context, structure, element, (node) => {
      for (const child of structureChildren(node)) {
        if (allowed.some((name) => matchesStructureElement(child, name))) continue;

        context.report({
          loc: child.startTag?.loc ?? child.loc,
          messageId: 'child',
          data: {
            element,
            actual: child.type === 'VElement' ? `<${child.rawName}>` : 'Text or an interpolation',
            allowed: allowed.map((name) => `<${name}>`).join(', '),
          },
        });
      }
    });
  },
});
