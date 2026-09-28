import { scriptExpressionWrappers, isPropsDeclarator } from '../../helpers/script-props.js';

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'require defineProps to be assigned to a const named props',
    },
    schema: [],
    messages: {
      assignment: 'Assign defineProps to a const named props. Destructuring, other names, and loose calls are not allowed.',
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'defineProps') {
          return;
        }

        let expression = node;

        while (expression.parent) {
          const parent = expression.parent;

          if ((scriptExpressionWrappers.has(parent.type) && parent.expression === expression)
            || (parent.type === 'CallExpression' && parent.callee.type === 'Identifier'
              && parent.callee.name === 'withDefaults' && parent.arguments[0] === expression)) {
            expression = parent;
            continue;
          }

          break;
        }

        const declaration = expression.parent;

        if (!isPropsDeclarator(declaration) || declaration.parent.kind !== 'const'
          || declaration.init !== expression) {
          // Renaming or introducing a binding requires reviewing its usages.
          context.report({ node, messageId: 'assignment' });
        }
      },
    };
  },
};
