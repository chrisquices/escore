import { propertyName, factoryName, formDefinition } from '../../../helpers/inertia-plus.js';

export default {
  meta: {
    type: 'problem',
    docs: { description: 'require explicit Inertia Plus form definitions' },
    schema: [],
    messages: {
      definition: 'Define useInertiaPlusForm fields and methods in an inline object.',
      unknown: 'Declare this form\'s data fields and methods explicitly in the inline object instead of using spreads or computed member names. Data fields are allowed; the only custom methods are submit() and optional beforeSubmit().',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    return {
      CallExpression(node) {
        if (factoryName(sourceCode, node.callee) !== 'useInertiaPlusForm') return;

        const definition = formDefinition(sourceCode, node);
        if (definition?.type !== 'ObjectExpression') {
          context.report({ node: definition ?? node, messageId: 'definition' });
          return;
        }

        for (const property of definition.properties) {
          if (property.type === 'SpreadElement' || propertyName(property) === undefined) {
            context.report({ node: property, messageId: 'unknown' });
          }
        }
      },
    };
  },
};
