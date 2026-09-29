import { getElementAttributes } from './require-element-attribute.js';
import { unwrapScriptExpression } from './script-props.js';

// Equal-looking loop/slot variables from different template scopes are not the
// same binding. Global/script identifiers are already identified by their names.
export const sameElementAttributeValue = (left, right) => {
  if (!left || !right || left.key !== right.key) return false;
  const locals = (value) => new Map((value.attribute.value?.references ?? [])
    .filter((reference) => reference.variable)
    .map((reference) => [reference.id.name, reference.variable]));
  const leftLocals = locals(left);
  const rightLocals = locals(right);
  return leftLocals.size === rightLocals.size
    && [...leftLocals].every(([name, variable]) => rightLocals.get(name) === variable);
};

export default (sourceCode) => {
  // Compare expression structure, not raw token spelling. Quote style,
  // parentheses, formatting, and TypeScript casts do not change an ID.
  const expressionShape = (expression) => {
    const node = unwrapScriptExpression(expression);
    if (!node) return null;
    if (node.type === 'Identifier') return ['Identifier', node.name];
    if (node.type === 'Literal') {
      if (node.regex) return ['RegExpLiteral', node.regex.pattern, node.regex.flags];
      if (node.bigint !== undefined) return ['BigIntLiteral', node.bigint];
      return ['Literal', node.value];
    }
    if (node.type === 'TemplateElement') return ['TemplateElement', node.value.cooked ?? node.value.raw];
    if (node.type === 'TemplateLiteral' && !node.expressions.length) {
      return ['Literal', node.quasis[0].value.cooked ?? node.quasis[0].value.raw];
    }

    const flags = ['operator', 'computed', 'optional', 'kind', 'method', 'shorthand', 'async', 'generator', 'delegate', 'prefix']
      .filter((key) => node[key] !== undefined)
      .map((key) => [key, node[key]]);
    const children = (sourceCode.visitorKeys[node.type] ?? [])
      .filter((key) => !['typeArguments', 'typeParameters', 'typeAnnotation', 'returnType'].includes(key))
      .map((key) => [key, Array.isArray(node[key]) ? node[key].map(expressionShape) : expressionShape(node[key])]);
    return [node.type, flags, children];
  };
  const expressionKey = (expression) => `expression:${JSON.stringify(expressionShape(expression))}`;

  return (node, name) => {
    const attribute = getElementAttributes(node, name)[0];
    if (!attribute) return undefined;

    const literal = (value) => String(value).trim()
      ? { attribute, key: `literal:${value}` }
      : undefined;

    if (!attribute.directive) return attribute.value ? literal(attribute.value.value) : undefined;
    if (!attribute.value) {
      return { attribute, key: expressionKey({ type: 'Identifier', name }) };
    }

    const expression = unwrapScriptExpression(attribute.value.expression);
    if (!expression) return undefined;

    if (expression.type === 'Literal') {
      if (['string', 'number'].includes(typeof expression.value)) return literal(expression.value);
      if (expression.value == null) return undefined;
    }

    if (expression.type === 'TemplateLiteral' && !expression.expressions.length) {
      const value = expression.quasis[0].value.cooked;
      return value == null ? undefined : literal(value);
    }

    return { attribute, key: expressionKey(expression) };
  };
};
