import { propertyName, formDefinition } from '../../../helpers/inertia-plus.js';

export default {
  meta: {
    type: 'problem',
    docs: { description: 'require submit in every Inertia Plus form' },
    schema: [],
    messages: { submit: 'useInertiaPlusForm requires a submit() method.' },
  },

  create(context) {
    return {
      CallExpression(node) {
        const definition = formDefinition(context.sourceCode, node);
        if (definition?.type !== 'ObjectExpression') return;

        const hasSubmit = definition.properties.some((property) =>
          property.type === 'Property' && propertyName(property) === 'submit');

        if (!hasSubmit) {
          context.report({ node: definition, messageId: 'submit' });
        }
      },
    };
  },
};
