// Add missing blank lines outside an element without changing its contents.
export default ({ elements, position, message }) => ({
  meta: {
    type: 'layout',
    docs: { description: 'enforce a blank line ' + position + ' ' + elements.join(' and ') },
    fixable: 'whitespace',
    schema: [],
    messages: { spacing: message },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const services = sourceCode.parserServices;
    if (!services.defineTemplateBodyVisitor) return {};

    const newline = sourceCode.text.includes('\r\n') ? '\r\n' : '\n';

    return services.defineTemplateBodyVisitor({
      VElement(node) {
        if (!elements.includes(node.rawName)) return;

        const below = position === 'below';
        const tag = below ? node.endTag : node.startTag;
        if (!tag) return;

        const offset = below ? tag.range[1] : tag.range[0];
        const gap = below
          ? sourceCode.text.slice(offset).match(/^\s*/)[0]
          : sourceCode.text.slice(0, offset).match(/\s*$/)[0];
        const lineBreaks = (gap.match(/\r\n|\r|\n/g) ?? []).length;
        if (lineBreaks >= 2) return;

        const insertion = below ? offset : offset - gap.length;
        context.report({
          loc: tag.loc,
          messageId: 'spacing',
          fix: (fixer) => fixer.insertTextBeforeRange(
            [insertion, insertion],
            newline.repeat(2 - lineBreaks),
          ),
        });
      },
    });
  },
});
