import { propertyName, formDefinition, functionValue } from '../../../helpers/inertia-plus.js';

export default {
  meta: {
    type: 'problem',
    docs: { description: 'require form methods that support the form this context' },
    schema: [],
    messages: {
      method: '{{ name }} must be a regular function method, such as {{ name }}() { ... }, so this refers to the form.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    return {
      CallExpression(node) {
        const definition = formDefinition(sourceCode, node);
        if (definition?.type !== 'ObjectExpression') return;

        for (const property of definition.properties) {
          if (property.type !== 'Property') continue;

          const name = propertyName(property);
          if (name !== 'submit' && name !== 'beforeSubmit') continue;

          const fn = functionValue(sourceCode, property.value);
          if (property.kind !== 'init' || !fn || fn.type === 'ArrowFunctionExpression') {
            context.report({ node: property, messageId: 'method', data: { name } });
          }
        }
      },
    };
  },
};
