import { unwrapExpression, propertyName, formDefinition, functionValue } from '../../../helpers/inertia-plus.js';

function callsBeforeSubmit(sourceCode, node) {
  if (!node || ['FunctionExpression', 'ArrowFunctionExpression', 'FunctionDeclaration',
    'ClassExpression', 'ClassDeclaration'].includes(node.type)) return false;

  if (node.type === 'CallExpression') {
    const callee = unwrapExpression(node.callee);
    if (callee?.type === 'MemberExpression'
      && unwrapExpression(callee.object)?.type === 'ThisExpression'
      && (callee.computed ? callee.property.value : callee.property.name) === 'beforeSubmit') {
      return true;
    }
  }

  return (sourceCode.visitorKeys[node.type] ?? []).some((key) => {
    const children = Array.isArray(node[key]) ? node[key] : [node[key]];
    return children.some((child) => callsBeforeSubmit(sourceCode, child));
  });
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'require submit to invoke the optional beforeSubmit method' },
    schema: [],
    messages: { call: 'Call this.beforeSubmit(...) directly from submit() after the processing guard and before the request. Pass the preparation arguments it needs; a call inside a nested callback does not satisfy this rule.' },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    return {
      CallExpression(node) {
        const definition = formDefinition(sourceCode, node);
        if (definition?.type !== 'ObjectExpression') return;

        const members = new Map(definition.properties
          .filter((property) => property.type === 'Property')
          .map((property) => [propertyName(property), property]));
        const submit = members.get('submit');
        const beforeSubmit = members.get('beforeSubmit');
        const submitFunction = functionValue(sourceCode, submit?.value);
        const beforeFunction = functionValue(sourceCode, beforeSubmit?.value);

        // Presence and function shape have their own rules.
        if (!submitFunction || !beforeFunction || submit?.kind !== 'init'
          || beforeSubmit?.kind !== 'init' || submitFunction.type === 'ArrowFunctionExpression'
          || beforeFunction.type === 'ArrowFunctionExpression') return;

        if (!callsBeforeSubmit(sourceCode, submitFunction.body)) {
          context.report({ node: submit, messageId: 'call' });
        }
      },
    };
  },
};
