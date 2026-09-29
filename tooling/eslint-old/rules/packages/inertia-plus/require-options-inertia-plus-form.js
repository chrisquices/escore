import { unwrapExpression, propertyName, factoryName } from '../../../helpers/inertia-plus.js';

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'require explicit boolean options for useInertiaPlusForm',
    },
    schema: [],
    messages: {
      options: 'useInertiaPlusForm requires an options object with explicit openable and minimumLoading booleans.',
      missing: 'Set {{ option }} explicitly to true or false in useInertiaPlusForm options.',
      boolean: '{{ option }} must be explicitly true or false and must not be overridden by a later spread or computed property.',
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        if (factoryName(context.sourceCode, node.callee) !== 'useInertiaPlusForm') {
          return;
        }

        const options = unwrapExpression(node.arguments[0]);

        if (options?.type !== 'ObjectExpression') {
          context.report({ node: options ?? node, messageId: 'options' });
          return;
        }

        for (const option of ['openable', 'minimumLoading']) {
          let property;
          let mayBeOverridden = false;

          // The last assignment wins. Unknown later properties cannot guarantee a boolean.
          for (const entry of [...options.properties].reverse()) {
            if (entry.type === 'SpreadElement' || propertyName(entry) === undefined) {
              mayBeOverridden = true;
              continue;
            }

            if (propertyName(entry) === option) {
              property = entry;
              break;
            }
          }

          if (!property) {
            context.report({ node: options, messageId: 'missing', data: { option } });
            continue;
          }

          const value = unwrapExpression(property.value);

          if (mayBeOverridden || property.kind !== 'init' || property.method
            || value?.type !== 'Literal' || typeof value.value !== 'boolean') {
            context.report({ node: property, messageId: 'boolean', data: { option } });
          }
        }
      },
    };
  },
};
