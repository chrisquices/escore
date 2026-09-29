// Preserve the existing nonempty-value checks where a rule explicitly requires them.
const expressionWrappers = new Set([
  'TSAsExpression', 'TSTypeAssertion', 'TSNonNullExpression',
  'TSSatisfiesExpression', 'TSInstantiationExpression', 'ChainExpression',
]);

export default (attribute) => {
  if (!attribute.directive) return Boolean(attribute.value?.value.trim());
  if (!attribute.value) return true; // Vue's shorthand binding.

  let expression = attribute.value.expression;
  while (expression && expressionWrappers.has(expression.type)) {
    expression = expression.expression;
  }

  if (!expression) return false;
  if (expression.type === 'Literal') {
    return expression.value != null
      && (typeof expression.value !== 'string' || Boolean(expression.value.trim()));
  }

  if (expression.type === 'TemplateLiteral' && expression.expressions.length === 0) {
    return Boolean(expression.quasis[0].value.cooked?.trim());
  }

  return true;
};
