import { unwrapExpression, propertyName, formDefinition, functionValue } from '../../../helpers/inertia-plus.js';

export default {
  meta: {
    type: 'problem',
    docs: { description: 'require a processing guard at the start of form submit methods' },
    schema: [],
    messages: { guard: 'Start submit() with if (this.processing) return; before any other work.' },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    return {
      CallExpression(node) {
        const definition = formDefinition(sourceCode, node);
        if (definition?.type !== 'ObjectExpression') return;

        const submit = definition.properties
          .filter((property) => property.type === 'Property' && propertyName(property) === 'submit')
          .at(-1);
        const fn = functionValue(sourceCode, submit?.value);

        // Missing/invalid methods are handled by their own rules.
        if (!fn || submit?.kind !== 'init' || fn.type === 'ArrowFunctionExpression'
          || fn.body?.type !== 'BlockStatement') return;

        const first = fn.body.body[0];
        const condition = unwrapExpression(first?.test);
        const consequent = first?.consequent;
        const exit = consequent?.type === 'BlockStatement' && consequent.body.length === 1
          ? consequent.body[0]
          : consequent;

        const hasGuard = first?.type === 'IfStatement'
          && !first.alternate
          && condition?.type === 'MemberExpression'
          && !condition.computed
          && !condition.optional
          && unwrapExpression(condition.object)?.type === 'ThisExpression'
          && condition.property.name === 'processing'
          && exit?.type === 'ReturnStatement'
          && exit.argument === null;

        if (!hasGuard) {
          context.report({ node: submit, messageId: 'guard' });
        }
      },
    };
  },
};
