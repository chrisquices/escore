import createInertiaRequestDetector from '../../helpers/inertia-request.js';

export default {
  meta: {
    type: 'layout',
    docs: { description: 'Separate Inertia request statements from preceding statements inside Vue script sections.' },
    fixable: 'whitespace',
    schema: [],
    messages: {
      spacing: 'Add a blank line before this Inertia request statement. Keep return/await attached to the request and keep leading comments or ESLint directives attached to the statement. The first statement in a block is exempt.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const getRequest = createInertiaRequestDetector(sourceCode);
    const newline = sourceCode.text.includes('\r\n') ? '\r\n' : '\n';
    const reported = new Set();

    return {
      CallExpression(node) {
        const request = getRequest(node);
        if (!request) return;

        let statement = node;
        while (statement.parent) {
          const parent = statement.parent;
          if (['Program', 'BlockStatement', 'SwitchCase'].includes(parent.type)) break;
          // Concise arrow bodies contain no preceding statement of their own.
          if (['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration'].includes(parent.type)) return;
          statement = parent;
        }
        const parent = statement.parent;
        const siblings = (parent?.type === 'SwitchCase' ? parent.consequent : parent?.body);
        if (!Array.isArray(siblings)) return;
        const inScript = siblings.filter((sibling) => sibling.range[0] >= request.script.startTag.range[1]
          && sibling.range[1] <= (request.script.endTag?.range[0] ?? request.script.range[1]));
        const index = inScript.indexOf(statement);
        if (index <= 0 || reported.has(statement)) return;

        // Treat contiguous leading comments as part of the request, especially
        // eslint-disable-next-line comments whose position affects their meaning.
        let anchor = sourceCode.getFirstToken(statement);
        let previous = sourceCode.getTokenBefore(anchor, { includeComments: true });
        while (previous && ['Line', 'Block'].includes(previous.type)
          && previous.range[0] >= inScript[index - 1].range[1]
          && previous.loc.end.line >= anchor.loc.start.line - 1
          && !sourceCode.lines[previous.loc.start.line - 1].slice(0, previous.loc.start.column).trim()) {
          anchor = previous;
          previous = sourceCode.getTokenBefore(anchor, { includeComments: true });
        }
        if (!previous) return;
        const range = [previous.range[1], anchor.range[0]];
        const gap = sourceCode.text.slice(...range);
        if (!/^[\t \r\n]*$/.test(gap) || /\n[\t ]*\n/.test(gap.replace(/\r\n?/g, '\n'))) return;

        const indent = sourceCode.lines[anchor.loc.start.line - 1].match(/^[\t ]*/)[0];
        reported.add(statement);
        context.report({
          node: statement,
          messageId: 'spacing',
          fix: (fixer) => fixer.replaceTextRange(range, newline + newline + indent),
        });
      },
    };
  },
};
