// Format only the whitespace around attributes. Their order, values, bindings,
// multiline expressions and the existing tag-closing syntax remain intact.
export default ({ elements }) => ({
  meta: {
    type: 'layout',
    docs: {
      description: `Format ${elements.map((name) => `<${name}>`).join(' and ')} with the first attribute beside the tag name, subsequent attributes on aligned separate lines, and the tag close beside the last attribute.`,
    },
    fixable: 'whitespace',
    schema: [],
    messages: {
      layout: 'Format <{{ component }}> with {{ first }} beside the tag name and each subsequent attribute on a new line aligned beneath {{ first }}. Keep {{ closing }} immediately after the last attribute. Preserve attribute order, values and expressions, including multiline values.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const services = sourceCode.parserServices;
    const tokenStore = services.getTemplateBodyTokenStore?.();
    if (!services.defineTemplateBodyVisitor || !tokenStore) return {};

    const newline = sourceCode.text.includes('\r\n') ? '\r\n' : '\n';

    return services.defineTemplateBodyVisitor({
      VElement(node) {
        if (!elements.includes(node.rawName)) return;
        const attributes = node.startTag.attributes;
        if (!attributes.length) return;

        const closing = tokenStore.getLastToken(node.startTag);
        const closingText = closing && sourceCode.getText(closing);
        if (!['>', '/>'].includes(closingText)) return;

        const linePrefix = sourceCode.lines[node.loc.start.line - 1].slice(0, node.loc.start.column);
        // Preserve tabs, but never copy preceding inline markup into indentation.
        const alignment = linePrefix.replace(/[^\t ]/g, ' ') + ' '.repeat(node.rawName.length + 2);
        const edits = [];
        const replaceGap = (start, end, replacement) => {
          const gap = sourceCode.text.slice(start, end);
          if (/^[\t \r\n\f]*$/.test(gap) && gap !== replacement) {
            edits.push({ range: [start, end], text: replacement });
          }
        };

        replaceGap(node.startTag.range[0] + node.rawName.length + 1, attributes[0].range[0], ' ');
        for (let index = 1; index < attributes.length; index++) {
          replaceGap(attributes[index - 1].range[1], attributes[index].range[0], newline + alignment);
        }
        replaceGap(attributes.at(-1).range[1], closing.range[0], '');
        if (!edits.length) return;

        context.report({
          loc: node.startTag.loc,
          messageId: 'layout',
          data: {
            component: node.rawName,
            first: sourceCode.getText(attributes[0].key),
            closing: closingText,
          },
          fix: (fixer) => edits.map(({ range, text }) => fixer.replaceTextRange(range, text)),
        });
      },
    });
  },
});
