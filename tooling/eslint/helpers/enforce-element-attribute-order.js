// Order listed attributes while preserving values, unlisted attributes, and whitespace.

// Bound camelCase props and their kebab-case equivalents occupy the same slot.
const normalize = (name) => name.replaceAll('-', '').toLowerCase();

const argumentName = (argument) => {
  if (argument?.type === 'VIdentifier') {
    return argument.name;
  }

  const expression = argument?.expression;

  if (expression?.type === 'Literal' && typeof expression.value === 'string') {
    return expression.value;
  }

  if (expression?.type === 'TemplateLiteral' && expression.expressions.length === 0) {
    return expression.quasis[0].value.cooked;
  }

  return undefined;
};

const attributeName = (attribute) => {
  if (!attribute.directive) {
    return attribute.key.name;
  }

  const directive = attribute.key.name.name;
  const argument = argumentName(attribute.key.argument);

  if (directive === 'model') {
    return 'v-model';
  }

  if (directive === 'bind') {
    return argument;
  }

  if (directive === 'on' && argument !== undefined) {
    return `@${argument}`;
  }

  return undefined;
};

const hasUnknownBindings = (attribute) => attribute.directive
  && ((['bind', 'on'].includes(attribute.key.name.name) && argumentName(attribute.key.argument) === undefined)
    || (attribute.key.name.name === 'model' && attribute.key.argument
      && argumentName(attribute.key.argument) === undefined));

const emittedKeys = (attribute) => {
  if (!attribute.directive) return [normalize(attribute.key.name)];

  const directive = attribute.key.name.name;
  const argument = argumentName(attribute.key.argument);

  if (directive === 'model') {
    if (attribute.key.argument && argument === undefined) return [];

    const prop = argument ?? 'modelValue';
    const keys = [prop, `onUpdate:${prop}`];
    if (attribute.key.modifiers.length) {
      keys.push(argument === undefined ? 'modelModifiers' : `${argument}Modifiers`);
    }
    return keys.map(normalize);
  }

  if (directive === 'bind' && argument !== undefined) return [normalize(argument)];

  if (directive === 'on' && argument !== undefined) {
    const modifiers = attribute.key.modifiers.map((modifier) => modifier.name)
      .filter((modifier) => ['once', 'capture', 'passive'].includes(modifier));
    return [normalize(`on${argument}${modifiers.join('')}`)];
  }

  return [];
};

export default ({
  elements,
  order,
  message = 'Place {{expected}} before {{actual}} on <{{component}}> to follow the configured attribute order.',
}) => ({
  meta: {
    type: 'layout',
    docs: { description: 'enforce the configured attribute order on ' + elements.join(' and ') + ' elements' },
    fixable: 'code',
    schema: [],
    messages: {
      order: message,
    },
  },

  create(context) {
    const ranks = new Map(order.map((name, index) => [normalize(name), index]));
    const sourceCode = context.sourceCode;
    const parserServices = sourceCode.parserServices;

    if (!parserServices.defineTemplateBodyVisitor) {
      return {};
    }

    return parserServices.defineTemplateBodyVisitor({
      VElement(node) {
        if (!elements.includes(node.rawName)) {
          return;
        }

        const attributes = node.startTag.attributes;
        const ranked = attributes.flatMap((attribute) => {
          const name = attributeName(attribute);
          const rank = name === undefined ? undefined : ranks.get(normalize(name));

          return rank === undefined ? [] : [{ attribute, rank }];
        });
        const sorted = [...ranked].sort((left, right) => left.rank - right.rank);
        const firstMismatch = ranked.findIndex((entry, index) => entry !== sorted[index]);

        if (firstMismatch === -1) {
          return;
        }

        context.report({
          loc: ranked[firstMismatch].attribute.loc,
          messageId: 'order',
          data: {
            expected: sourceCode.getText(sorted[firstMismatch].attribute.key),
            actual: sourceCode.getText(ranked[firstMismatch].attribute.key),
            component: node.rawName,
            order: order.join(' → '),
          },
          fix(fixer) {
            const moved = ranked.flatMap((entry, index) => entry === sorted[index]
              ? [] : [{ from: entry.attribute, to: sorted[index].attribute }]);

            // Crossing v-bind/v-on objects or dynamic names may change which
            // value wins. Report these cases without changing runtime behavior.
            const crossesUnknownBinding = moved.some(({ from, to }) => attributes.some((attribute) =>
              hasUnknownBindings(attribute)
              && attribute.range[0] >= Math.min(from.range[0], to.range[0])
              && attribute.range[0] <= Math.max(from.range[0], to.range[0])));

            if (crossesUnknownBinding) {
              return null;
            }

            const replacements = new Map(ranked.map((entry, index) => [entry.attribute, sorted[index].attribute]));
            const positions = new Map(attributes.map((attribute, index) => [replacements.get(attribute) ?? attribute, index]));
            const keys = attributes.map(emittedKeys);
            const reversesSharedBinding = attributes.some((attribute, index) => attributes.slice(index + 1)
              .some((other, offset) => positions.get(attribute) > positions.get(other)
                && keys[index].some((key) => keys[index + offset + 1].includes(key))));

            // v-model also emits a prop and an update listener. Reordering either
            // against an explicit binding can change precedence or handler order.
            if (reversesSharedBinding) return null;

            // Replace whole attribute tokens, never reconstruct their values or
            // copy surrounding markup. Unlisted attributes stay in their slots.
            return moved.map(({ from, to }) => fixer.replaceText(from, sourceCode.getText(to)));
          },
        });
      },
    });
  },
});
