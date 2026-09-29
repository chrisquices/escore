import { factoryName, consumingDeclarator } from '../../../helpers/inertia-plus.js';

export default {
  meta: {
    type: 'problem',
    docs: { description: 'require a named const for Inertia Plus composables' },
    schema: [],
    messages: { declaration: '{{ factory }} must be assigned directly to a named const.' },
  },

  create(context) {
    return {
      CallExpression(node) {
        const factory = factoryName(context.sourceCode, node.callee);
        if (!factory) return;

        const declarator = consumingDeclarator(node);
        if (declarator?.id.type !== 'Identifier' || declarator.parent.kind !== 'const') {
          context.report({ node, messageId: 'declaration', data: { factory } });
        }
      },
    };
  },
};
