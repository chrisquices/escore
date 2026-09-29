export const scriptExpressionWrappers = new Set([
  'TSAsExpression',
  'TSTypeAssertion',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSInstantiationExpression',
  'ChainExpression',
]);

export const unwrapScriptExpression = (node) => {
  while (node && scriptExpressionWrappers.has(node.type)) {
    node = node.expression;
  }

  return node;
};

export const isDefinePropsExpression = (expression) => {
  const node = unwrapScriptExpression(expression);

  if (node?.type !== 'CallExpression' || node.callee.type !== 'Identifier') {
    return false;
  }

  return node.callee.name === 'defineProps'
    || (node.callee.name === 'withDefaults' && isDefinePropsExpression(node.arguments[0]));
};

export const isPropsDeclarator = (node) => node?.type === 'VariableDeclarator'
  && node.id.type === 'Identifier'
  && node.id.name === 'props'
  && isDefinePropsExpression(node.init);
