import { isField, isFieldContent, isFieldLabel, isInput } from '../../../helpers/field-structure.js';
import { getElementAttributes } from '../../../helpers/require-element-attribute.js';
import { unwrapScriptExpression } from '../../../helpers/script-props.js';

// Compare authored values/expressions, never execute bindings or rewrite IDs.
export default {
  meta: {
    type: 'problem',
    docs: { description: 'match FieldLabel for and FieldContent input id within the same Field' },
    schema: [],
    messages: {
      mismatch: 'FieldLabel bindings [{{ labels }}] do not match input bindings [{{ inputs }}] in this <Field>. Pair each for/:for with the intended id/:id using the same value or dynamic expression. Preserve existing references to these IDs.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const services = sourceCode.parserServices;
    if (!services.defineTemplateBodyVisitor) return {};

    // Compare expression structure, not raw token spelling. Quote style,
    // parentheses, formatting, and TypeScript casts do not change an ID.
    const expressionShape = (expression) => {
      const node = unwrapScriptExpression(expression);
      if (!node) return null;
      if (node.type === 'Identifier') return ['Identifier', node.name];
      if (node.type === 'Literal') return ['Literal', node.regex ?? node.bigint ?? node.value];
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

    const attributeValue = (node, name) => {
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

    return services.defineTemplateBodyVisitor({
      VElement(node) {
        if (!isField(node)) return;

        // Direct relationships exclude nested Fields and malformed structures,
        // whose placement and required attributes have their own rules.
        const labels = node.children.filter(isFieldLabel);
        const inputs = node.children.filter(isFieldContent).flatMap((content) => content.children.filter(isInput));
        const labelValues = labels.map((label) => attributeValue(label, 'for')).filter(Boolean);
        const inputValues = inputs.map((input) => attributeValue(input, 'id')).filter(Boolean);
        if (!labelValues.length || !inputValues.length) return;

        const mismatch = labelValues.find((label) => !inputValues.some((input) => input.key === label.key))
          ?? inputValues.find((input) => !labelValues.some((label) => label.key === input.key));
        if (!mismatch) return;

        context.report({
          node: mismatch.attribute,
          messageId: 'mismatch',
          data: {
            labels: labelValues.map(({ attribute }) => sourceCode.getText(attribute)).join(', '),
            inputs: inputValues.map(({ attribute }) => sourceCode.getText(attribute)).join(', '),
          },
        });
      },
    });
  },
};
