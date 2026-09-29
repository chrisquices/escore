import { formDefinition, propertyName } from './inertia-plus.js';

export default (method) => ({
  meta: {
    type: 'layout',
    docs: { description: `Require a blank line above ${method}() in Inertia Plus form definitions.` },
    fixable: 'whitespace',
    schema: [],
    messages: {
      spacing: `Add a blank line above ${method}() in this useInertiaPlusForm definition. Keep any leading comments attached to the method.`,
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const newline = sourceCode.text.includes('\r\n') ? '\r\n' : '\n';
    const prefix = (node) => sourceCode.lines[node.loc.start.line - 1].slice(0, node.loc.start.column);

    return {
      CallExpression(node) {
        const definition = formDefinition(sourceCode, node);
        if (definition?.type !== 'ObjectExpression') return;

        for (const [index, property] of definition.properties.entries()) {
          if (property.type !== 'Property' || propertyName(property) !== method) continue;

          let anchor = sourceCode.getFirstToken(property);
          let previous = sourceCode.getTokenBefore(anchor, { includeComments: true });
          const boundary = index ? definition.properties[index - 1].range[1] : definition.range[0];
          while (previous && ['Line', 'Block'].includes(previous.type)
            && previous.range[0] >= boundary
            && previous.loc.end.line >= anchor.loc.start.line - 1
            && (!prefix(previous).trim() || /^\s*eslint-(?:disable|enable)/.test(previous.value))) {
            anchor = previous;
            previous = sourceCode.getTokenBefore(anchor, { includeComments: true });
          }
          if (!previous) continue;
          const range = [previous.range[1], anchor.range[0]];
          const gap = sourceCode.text.slice(...range);
          if (!/^[\t \r\n]*$/.test(gap) || /\n[\t ]*\n/.test(gap.replace(/\r\n?/g, '\n'))) continue;

          let indent = prefix(anchor);
          if (indent.trim()) {
            const standalone = definition.properties.find((entry) => !prefix(entry).trim()
              && entry.loc.start.line > definition.loc.start.line);
            const base = prefix(definition).match(/^[\t ]*/)[0];
            indent = standalone ? prefix(standalone) : base + (base.includes('\t') ? '\t' : '    ');
          }

          context.report({
            node: property,
            messageId: 'spacing',
            fix: (fixer) => fixer.replaceTextRange(range, newline + newline + indent),
          });
        }
      },
    };
  },
});
