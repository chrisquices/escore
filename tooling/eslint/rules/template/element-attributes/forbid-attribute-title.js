// Remove title attributes from native elements and Vue components.
// Handle literal attributes, Vue bindings, and explicit v-bind object keys.

const unwrapExpression = (expression) => {
  while (expression && [
    'TSAsExpression',
    'TSTypeAssertion',
    'TSNonNullExpression',
    'TSSatisfiesExpression',
    'ParenthesizedExpression',
  ].includes(expression.type)) {
    expression = expression.expression;
  }

  return expression;
};

const literalName = (expression) => {
  expression = unwrapExpression(expression);

  if (expression?.type === 'Literal' && typeof expression.value === 'string') {
    return expression.value;
  }

  if (expression?.type === 'TemplateLiteral' && expression.expressions.length === 0) {
    return expression.quasis[0].value.cooked;
  }

  return undefined;
};

const isForbidden = (name) => typeof name === 'string'
  && name.toLowerCase() === 'title';

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'disallow title attributes',
    },
    fixable: 'code',
    schema: [],
    messages: {
      forbidden: 'Remove {{name}}; title attributes are not allowed.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const parserServices = sourceCode.parserServices;

    if (!parserServices.defineTemplateBodyVisitor) {
      return {};
    }

    const tokenStore = parserServices.getTemplateBodyTokenStore();

    const reportAttribute = (attribute, name) => {
      if (!isForbidden(name)) {
        return;
      }

      context.report({
        node: attribute,
        messageId: 'forbidden',
        data: { name },
        fix(fixer) {
          let start = attribute.range[0];

          // Remove only the attribute and its preceding whitespace, never markup.
          while (start > attribute.parent.range[0] && /\s/u.test(sourceCode.text[start - 1])) {
            start -= 1;
          }

          return fixer.removeRange([start, attribute.range[1]]);
        },
      });
    };

    const reportObjectProperty = (property, name) => {
      if (!isForbidden(name)) {
        return;
      }

      context.report({
        node: property,
        messageId: 'forbidden',
        data: { name },
        fix(fixer) {
          const next = tokenStore.getTokenAfter(property);
          const previous = tokenStore.getTokenBefore(property);
          const comma = next?.value === ',' ? next : previous?.value === ',' ? previous : undefined;

          // Remove the comma separately so adjacent comments remain intact.
          return comma ? [fixer.remove(property), fixer.remove(comma)] : fixer.remove(property);
        },
      });
    };

    return parserServices.defineTemplateBodyVisitor({
      VAttribute(attribute) {
        if (!attribute.directive) {
          reportAttribute(attribute, attribute.key.name);
          return;
        }

        if (attribute.key.name.name !== 'bind') {
          return;
        }

        const argument = attribute.key.argument;

        if (argument) {
          const name = argument.type === 'VIdentifier' ? argument.name : literalName(argument.expression);

          reportAttribute(attribute, name);
          return;
        }

        const expression = unwrapExpression(attribute.value?.expression);

        if (expression?.type !== 'ObjectExpression') {
          return;
        }

        for (const property of expression.properties) {
          if (property.type !== 'Property') {
            continue;
          }

          const name = !property.computed && property.key.type === 'Identifier'
            ? property.key.name
            : literalName(property.key);

          reportObjectProperty(property, name);
        }
      },
    });
  },
};
