import { formDefinition, propertyName } from '../../../helpers/inertia-plus.js';

export default {
  meta: {
    type: 'layout',
    docs: { description: 'Declare beforeSubmit before submit in Inertia Plus form definitions when both exist.' },
    schema: [],
    messages: {
      order: 'Declare beforeSubmit() above submit() in this useInertiaPlusForm definition. Move the entire preparation member with its comments while preserving its behavior.',
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        const definition = formDefinition(context.sourceCode, node);
        if (definition?.type !== 'ObjectExpression') return;
        const submit = definition.properties.find((property) => property.type === 'Property'
          && propertyName(property) === 'submit');
        if (!submit) return;

        for (const property of definition.properties) {
          if (property.type === 'Property' && propertyName(property) === 'beforeSubmit'
            && property.range[0] > submit.range[0]) {
            context.report({ node: property, messageId: 'order' });
          }
        }
      },
    };
  },
};
