// Require root-level placement in a final group. Never move code automatically.
export default ({ elements, endGroup = elements }) => ({
  meta: {
    type: 'suggestion',
    docs: { description: `Require ${elements.map((name) => `<${name}>`).join(' or ')} as direct children of the root template, in a final group containing only ${endGroup.map((name) => `<${name}>`).join(', ')}.` },
    schema: [],
    messages: {
      nested: 'Move <{{ component }}> to be a direct child of the root <template>, outside all wrapping elements. Preserve its bindings and any conditions or loop variables it currently depends on.',
      end: 'Move <{{ component }}> into the final Dialog/AlertDialog group at the end of the root <template>. Move other content before this group; either dialog type may come first. Preserve each component\'s bindings and behavior.',
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
