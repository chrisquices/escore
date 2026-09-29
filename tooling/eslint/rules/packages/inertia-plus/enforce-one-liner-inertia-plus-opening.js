import { unwrapExpression, factoryName, consumingDeclarator } from '../../../helpers/inertia-plus.js';

function hasMultilinePrefixBody(sourceCode, node, end) {
  if (!node || node.range[0] >= end) return false;

  // Newlines can terminate statements, class fields, and type members. Only
  // inspect the prefix; the definition body itself is not being flattened.
  if (['BlockStatement', 'ClassBody', 'StaticBlock', 'TSTypeLiteral',
    'TSInterfaceBody', 'TSModuleBlock'].includes(node.type)
    && node.loc.start.line !== node.loc.end.line) return true;

  return (sourceCode.visitorKeys[node.type] ?? []).some((key) => {
    const children = Array.isArray(node[key]) ? node[key] : [node[key]];
    return children.some((child) => hasMultilinePrefixBody(sourceCode, child, end));
  });
}

export default {
  meta: {
    type: 'layout',
    docs: { description: 'keep Inertia Plus declaration openings on one line' },
    fixable: 'whitespace',
    schema: [],
    messages: { opening: 'Keep the declaration, options, and definition opening brace on one line.' },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    return {
      CallExpression(node) {
        const factory = factoryName(sourceCode, node.callee);
        if (!factory) return;

        const declarator = consumingDeclarator(node);
        const definition = unwrapExpression(node.arguments[factory === 'useInertiaPlusForm' ? 1 : 0]);
        if (!declarator || definition?.type !== 'ObjectExpression') return;

        const declaration = declarator.parent;
        const start = declaration.declarations[0] === declarator ? declaration : declarator;
        const opening = sourceCode.getFirstToken(definition);
        if (start.loc.start.line === opening.loc.end.line) return;

        context.report({
          node,
          messageId: 'opening',
          fix(fixer) {
            if (hasMultilinePrefixBody(sourceCode, start, opening.range[0])) return null;

            const tokens = sourceCode.getTokens(start, { includeComments: true })
              .filter((token) => token.range[1] <= opening.range[1]);

            // Moving comments or rewriting strings/templates can change behavior.
            if (tokens.some((token) => ['Line', 'Block'].includes(token.type)
              || token.loc.start.line !== token.loc.end.line)) return null;

            const fixes = [];
            for (let index = 1; index < tokens.length; index++) {
              const range = [tokens[index - 1].range[1], tokens[index].range[0]];
              const gap = sourceCode.text.slice(...range);
              if (/^[\s]*$/.test(gap) && /[\r\n\u2028\u2029]/.test(gap)) {
                fixes.push(fixer.replaceTextRange(range, ' '));
              }
            }

            return fixes;
          },
        });
      },
    };
  },
};
