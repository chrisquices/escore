// Shared explicit-attribute lookup. Plain attributes and v-bind are equivalent by default.
// Value checks and conditional requirements belong to the calling rule.

export const getElementAttributes = (node, name, { directive, caseInsensitive = false } = {}) => {
  const normalize = (value) => caseInsensitive ? value.toLowerCase() : value;
  const names = [name].flat().map(normalize);

  return node.startTag.attributes.filter((attribute) => {
    if (!attribute.directive) {
      return !directive && names.includes(normalize(attribute.key.name));
    }

    return attribute.key.name.name === (directive ?? 'bind')
      && attribute.key.argument?.type === 'VIdentifier'
      && names.includes(normalize(attribute.key.argument.name));
  });
};

export const hasElementAttribute = (node, name, options) => (
  getElementAttributes(node, name, options).length > 0
);

// Report only: never guess an attribute value or add a binding.
export default ({
  elements,
  attribute,
  directive,
  when,
  validate,
  type = 'suggestion',
  description = 'require an explicit ' + attribute + ' attribute on ' + elements.join(' and '),
  message = '<{{ component }}> requires an explicit ' + attribute + ' or :' + attribute + ' attribute.',
}) => ({
  meta: {
    type,
    docs: { description },
    schema: [],
    messages: { missing: message },
  },

  create(context) {
    const services = context.sourceCode.parserServices;
    if (!services.defineTemplateBodyVisitor) return {};

    return services.defineTemplateBodyVisitor({
      VElement(node) {
        if (!elements.includes(node.rawName) || (when && !when(node))) return;

        const attributes = getElementAttributes(node, attribute, { directive });
        if (attributes.length && (!validate || validate(attributes))) return;

        context.report({
          loc: node.startTag.loc,
          messageId: 'missing',
          data: { component: node.rawName },
        });
      },
    });
  },
});
