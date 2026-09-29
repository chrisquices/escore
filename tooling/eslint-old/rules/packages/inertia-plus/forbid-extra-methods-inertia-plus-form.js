import { propertyName, formDefinition, functionValue } from '../../../helpers/inertia-plus.js';

export default {
  meta: {
    type: 'problem',
    docs: { description: 'restrict custom Inertia Plus form method names' },
    schema: [],
    messages: {
      extra: 'The custom method {{ name }} is not allowed on useInertiaPlusForm. Keep data fields, submit(), and optional beforeSubmit(); place preparation in beforeSubmit() and request logic in submit(). Preserve the behavior when restructuring. Use useInertiaPlus for broader domain state that needs additional methods.',
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
          if (name === undefined || name === 'submit' || name === 'beforeSubmit') continue;

          if (functionValue(sourceCode, property.value) || property.method || property.kind !== 'init') {
            context.report({ node: property, messageId: 'extra', data: { name } });
          }
        }
      },
    };
  },
};
