// Report only: choosing and importing a replacement component requires a manual edit.
export default ({ elements, message = 'Native <{{ element }}> is not allowed.' }) => ({
  meta: {
    type: 'suggestion',
    docs: { description: 'forbid native ' + elements.join(' and ') + ' elements in Vue templates' },
    schema: [],
    messages: { forbidden: typeof message === 'function' ? '{{ instruction }}' : message },
  },

  create(context) {
    const services = context.sourceCode.parserServices;
    if (!services.defineTemplateBodyVisitor) return {};

    return services.defineTemplateBodyVisitor({
      VElement(node) {
        // Preserve case so native <label> and component <Label> remain distinct.
        if (!elements.includes(node.rawName)) return;

        context.report({
          loc: node.startTag.loc,
          messageId: 'forbidden',
          data: {
            element: node.rawName,
            instruction: typeof message === 'function' ? message(node) : undefined,
          },
        });
      },
    });
  },
});
