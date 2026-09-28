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
      mismatch: 'FieldLabel for and input id must match within this Field. Use the same expression for dynamic bindings.',
    },
  },

  create(context) {
    const services = context.sourceCode.parserServices;
    const tokenStore = services.getTemplateBodyTokenStore?.();
    if (!services.defineTemplateBodyVisitor || !tokenStore) return {};

    const attributeValue = (node, name) => {
      const attribute = getElementAttributes(node, name)[0];
      if (!attribute) return undefined;

      const literal = (value) => String(value).trim()
        ? { attribute, key: `literal:${value}` }
        : undefined;

      if (!attribute.directive) return attribute.value ? literal(attribute.value.value) : undefined;
      if (!attribute.value) {
        return { attribute, key: `expression:${JSON.stringify([['Identifier', name]])}` };
      }

      const expression = unwrapScriptExpression(attribute.value.expression);
      if (!expression) return undefined;

      // Vue shorthand uses an HTMLIdentifier token for the same JS identifier.
      if (expression.type === 'Identifier') {
        return { attribute, key: `expression:${JSON.stringify([['Identifier', expression.name]])}` };
      }

      if (expression.type === 'Literal') {
        if (['string', 'number'].includes(typeof expression.value)) return literal(expression.value);
        if (expression.value == null) return undefined;
      }

      if (expression.type === 'TemplateLiteral' && !expression.expressions.length) {
        const value = expression.quasis[0].value.cooked;
        return value == null ? undefined : literal(value);
      }

      // Whitespace between tokens is irrelevant; whitespace inside strings is not.
      const tokens = tokenStore.getTokens(expression).map((token) => [token.type, token.value]);
      return { attribute, key: `expression:${JSON.stringify(tokens)}` };
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

        for (const label of labelValues) {
          if (!inputValues.some((input) => input.key === label.key)) {
            context.report({ node: label.attribute, messageId: 'mismatch' });
          }
        }

        for (const input of inputValues) {
          if (!labelValues.some((label) => label.key === input.key)) {
            context.report({ node: input.attribute, messageId: 'mismatch' });
          }
        }
      },
    });
  },
};
