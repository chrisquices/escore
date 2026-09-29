import { unwrapScriptExpression } from '../../../helpers/script-props.js';

const inlineLogic = new Set([
  'AssignmentExpression', 'UpdateExpression', 'SequenceExpression',
  'ArrowFunctionExpression', 'FunctionExpression', 'ClassExpression',
  'NewExpression', 'TaggedTemplateExpression', 'AwaitExpression', 'YieldExpression',
]);

const isMethodReference = (expression) => {
  const node = unwrapScriptExpression(expression);
  if (node?.type === 'Identifier') return true;
  return node?.type === 'MemberExpression'
    && (unwrapScriptExpression(node.object)?.type === 'ThisExpression' || isMethodReference(node.object));
};

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require click handlers to contain one method reference or one direct method call, with coordinated logic inside the method.',
    },
    schema: [],
    messages: {
      singleCall: 'Use one method reference, such as @click="editKey", or one direct call, such as @click="editKeyDialog.show({ id: key.id })". Move assignments, branching, inline functions, and additional calls into the action method. Keep simple method calls inline without creating redundant wrappers.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const services = sourceCode.parserServices;
    if (!services.defineTemplateBodyVisitor) return {};

    // Count calls throughout the expression so extra work cannot be hidden in
    // a call's arguments or in a computed property. Object payloads remain valid.
    const hasInlineLogic = (expression, allowedCall) => {
      const node = unwrapScriptExpression(expression);
      if (!node || node.type.startsWith('TS')) return false;
      if (inlineLogic.has(node.type)
        || (node.type === 'CallExpression' && node !== allowedCall)
        || (node.type === 'UnaryExpression' && node.operator === 'delete')) return true;

      return (sourceCode.visitorKeys[node.type] ?? []).some((key) => {
        const value = node[key];
        return (Array.isArray(value) ? value : [value])
          .some((child) => child?.type && hasInlineLogic(child, allowedCall));
      });
    };

    return services.defineTemplateBodyVisitor({
      VAttribute(node) {
        if (!node.directive || node.key.name.name !== 'on'
          || node.key.argument?.type !== 'VIdentifier' || node.key.argument.name !== 'click') return;

        let expression = node.value?.expression;
        if (expression?.type === 'VOnExpression') {
          expression = expression.body.length === 1 && expression.body[0].type === 'ExpressionStatement'
            ? expression.body[0].expression
            : undefined;
        }
        expression = unwrapScriptExpression(expression);
        const call = expression?.type === 'CallExpression' ? expression : undefined;
        if (isMethodReference(call?.callee ?? expression) && !hasInlineLogic(expression, call)) return;

        context.report({ node: node.value ?? node, messageId: 'singleCall' });
      },
    });
  },
};
