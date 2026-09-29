import { isSurfaceName, factoryName, consumingDeclarator } from '../../../helpers/inertia-plus.js';

export default {
  meta: {
    type: 'problem',
    docs: { description: 'require Form, Dialog, Sheet, or Drawer suffixes for Inertia Plus forms' },
    schema: [],
    messages: { name: 'useInertiaPlusForm variable names must end in Form, Dialog, Sheet, or Drawer.' },
  },

  create(context) {
    return {
      CallExpression(node) {
        if (factoryName(context.sourceCode, node.callee) !== 'useInertiaPlusForm') return;

        const declarator = consumingDeclarator(node);
        if (declarator?.id.type === 'Identifier' && !declarator.id.name.endsWith('Form')
          && !isSurfaceName(declarator.id.name)) {
          context.report({ node: declarator.id, messageId: 'name' });
        }
      },
    };
  },
};
