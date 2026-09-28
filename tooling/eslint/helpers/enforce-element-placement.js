// Require root-level placement in a final group. Never move code automatically.
export default ({ elements, endGroup = elements }) => ({
  meta: {
    type: 'suggestion',
    docs: { description: 'require configured elements at the root and end of the template' },
    schema: [],
    messages: {
      nested: '<{{ component }}> must be a direct child of the root <template>.',
      end: '<{{ component }}> must belong to the final group at the end of the root <template>. Move other content before this group.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const templateBody = sourceCode.ast.templateBody;
    const services = sourceCode.parserServices;
    if (!templateBody || !services.defineTemplateBodyVisitor) return {};

    return services.defineTemplateBodyVisitor({
      VElement(node) {
        if (!elements.includes(node.rawName)) return;

        if (node.parent !== templateBody) {
          context.report({
            loc: node.startTag.loc,
            messageId: 'nested',
            data: { component: node.rawName },
          });
          return;
        }

        const siblings = templateBody.children;
        const hasContentAfter = siblings.slice(siblings.indexOf(node) + 1).some((child) => {
          if (child.type === 'VHTMLComment' || (child.type === 'VText' && !child.value.trim())) return false;
          return child.type !== 'VElement' || !endGroup.includes(child.rawName);
        });

        if (hasContentAfter) {
          context.report({
            loc: node.startTag.loc,
            messageId: 'end',
            data: { component: node.rawName },
          });
        }
      },
    });
  },
});
