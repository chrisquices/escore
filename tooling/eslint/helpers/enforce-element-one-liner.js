// Shared single-line enforcement. Only simple content is safe to join automatically.
export const preservesElementWhitespace = (node) => {
  for (let current = node; current?.type === 'VElement'; current = current.parent) {
    if (['pre', 'textarea', 'script', 'style'].includes(current.rawName)
      || current.startTag.attributes.some((attribute) => attribute.directive && attribute.key.name.name === 'pre')) {
      return true;
    }
  }

  return false;
};

export const reportElementOneLiner = (context, node, tokenStore) => {
  const sourceCode = context.sourceCode;

  context.report({
    loc: node.loc,
    messageId: 'inline',
    data: { component: node.rawName },
    fix(fixer) {
      if (preservesElementWhitespace(node)) return null;

      const attributes = node.startTag.attributes.map((attribute) => sourceCode.getText(attribute));
      if (attributes.some((attribute) => /[\r\n]/.test(attribute))
        || node.children.some((child) => child.type !== 'VText'
          && (child.type !== 'VExpressionContainer' || child.loc.start.line !== child.loc.end.line))
        || tokenStore.getTokens(node, { includeComments: true }).some((token) => token.type === 'HTMLComment')) {
        return null;
      }

      const opening = `<${node.rawName}${attributes.length ? ` ${attributes.join(' ')}` : ''}${node.startTag.selfClosing ? ' />' : '>'}`;

      if (!node.endTag) {
        return node.children.length ? null : fixer.replaceText(node.startTag, opening);
      }

      const joined = node.children.map((child) => child.type === 'VText'
        ? sourceCode.getText(child).replace(/[\t \r\n]+/g, ' ')
        : sourceCode.getText(child)).join('');
      // Keep intentional spaces at text boundaries. Removing them can join words
      // when this element sits next to text or another inline element.
      const content = joined.trim() ? joined : '';

      return [
        fixer.replaceText(node.startTag, opening),
        fixer.replaceTextRange([node.startTag.range[1], node.endTag.range[0]], content),
        fixer.replaceText(node.endTag, sourceCode.getText(node.endTag).replace(/[\t \r\n]+(?=>)/g, '')),
      ];
    },
  });
};

export default ({ elements, textOnly = false, message = 'Keep <{{ component }}> on one line.' }) => ({
  meta: {
    type: 'layout',
    docs: { description: 'enforce single-line ' + elements.join(' and ') + ' elements' },
    fixable: 'whitespace',
    schema: [],
    messages: { inline: message },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const services = sourceCode.parserServices;
    const tokenStore = services.getTemplateBodyTokenStore?.();
    if (!services.defineTemplateBodyVisitor || !tokenStore) return {};

    return services.defineTemplateBodyVisitor({
      VElement(node) {
        if (!elements.includes(node.rawName) || node.loc.start.line === node.loc.end.line) return;
        if (textOnly && (!node.endTag || preservesElementWhitespace(node)
          || node.children.some((child) => child.type === 'VElement')
          || tokenStore.getTokens(node, { includeComments: true }).some((token) => token.type === 'HTMLComment'))) return;

        reportElementOneLiner(context, node, tokenStore);
      },
    });
  },
});
