import { hasElementAttribute } from './require-element-attribute.js';

// Require composition with a child control within the specified container.
// Stop traversal at component boundaries so nested surfaces stay independent.
export default ({ elements, within, children, boundaries }) => ({
  meta: {
    type: 'problem',
    docs: {
      description: `Require as-child on ${elements[0]} containing ${children[0]} inside ${within[0]}.`,
    },
    fixable: 'code',
    schema: [],
    messages: {
      missing: '<{{ component }}> containing <{{ child }}> inside <{{ container }}> requires as-child.',
    },
  },

  create(context) {
    const services = context.sourceCode.parserServices;
    if (!services.defineTemplateBodyVisitor) return {};

    const insideContainer = (node) => {
      let parent = node.parent;
      while (parent?.type === 'VElement') {
        if (within.includes(parent.rawName)) return true;
        if (boundaries.includes(parent.rawName)) return false;
        parent = parent.parent;
      }
      return false;
    };

    const containsChild = (node) => node.children.some((child) => {
      if (child.type !== 'VElement') return false;
      if (children.includes(child.rawName)) return true;
      if (elements.includes(child.rawName) || boundaries.includes(child.rawName)) return false;
      return containsChild(child);
    });

    return services.defineTemplateBodyVisitor({
      VElement(node) {
        if (!elements.includes(node.rawName) || !insideContainer(node) || !containsChild(node)) return;
        if (hasElementAttribute(node, ['as-child', 'aschild'], { caseInsensitive: true })) return;

        context.report({
          loc: node.startTag.loc,
          messageId: 'missing',
          data: { component: node.rawName, child: children[0], container: within[0] },
          fix: (fixer) => fixer.insertTextAfterRange(
            [node.startTag.range[0], node.startTag.range[0] + node.rawName.length + 1],
            ' as-child',
          ),
        });
      },
    });
  },
});
