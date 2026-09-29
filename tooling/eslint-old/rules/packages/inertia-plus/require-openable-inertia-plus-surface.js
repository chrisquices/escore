import { isSurfaceName, unwrapExpression, propertyName, factoryName, consumingDeclarator } from '../../../helpers/inertia-plus.js';

export default {
  meta: {
    type: 'problem',
    docs: { description: 'require openable: true for Inertia Plus surface forms' },
    schema: [],
    messages: { openable: 'Form names ending in Dialog, Sheet, or Drawer require openable: true.' },
  },

  create(context) {
    return {
      CallExpression(node) {
        if (factoryName(context.sourceCode, node.callee) !== 'useInertiaPlusForm') return;

        const declarator = consumingDeclarator(node);
        if (declarator?.id.type !== 'Identifier' || !isSurfaceName(declarator.id.name)) return;

        const options = unwrapExpression(node.arguments[0]);
        if (options?.type !== 'ObjectExpression') return;

        const property = options.properties
          .filter((entry) => entry.type === 'Property' && propertyName(entry) === 'openable')
          .at(-1);
        const value = unwrapExpression(property?.value);

        if (property?.kind !== 'init' || value?.type !== 'Literal' || value.value !== true) {
          context.report({ node: property ?? options, messageId: 'openable' });
        }
      },
    };
  },
};
