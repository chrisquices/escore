import createInertiaRequestDetector from '../../helpers/inertia-request.js';

export default {
  meta: {
    type: 'layout',
    docs: { description: 'Put nonempty Inertia request options on multiple lines inside Vue script sections.' },
    fixable: 'whitespace',
    schema: [],
    messages: {
      layout: 'Expand this Inertia request options object: put each property on its own line after the opening brace, and the closing brace on a separate line. Preserve payload data, callback bodies, values, and comments.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const getRequest = createInertiaRequestDetector(sourceCode);
    const newline = sourceCode.text.includes('\r\n') ? '\r\n' : '\n';
    const indentation = (node) => sourceCode.lines[node.loc.start.line - 1].match(/^[\t ]*/)[0];

    return {
      CallExpression(node) {
        const options = getRequest(node)?.options;
        if (options?.type !== 'ObjectExpression' || !options.properties.length) return;

        const indent = indentation(node);
        let unit = indent.includes('\t') ? '\t' : '    ';
        for (let parent = node.parent; parent; parent = parent.parent) {
          const parentIndent = indentation(parent);
          if (parent.loc.start.line < node.loc.start.line && indent.startsWith(parentIndent)
            && parentIndent.length < indent.length) {
            unit = indent.slice(parentIndent.length);
            break;
          }
        }

        const edits = new Map();
        const separate = (left, right, nextIndent) => {
          const range = [left.range[1], right.range[0]];
          const gap = sourceCode.text.slice(...range);
          if (!/^[\t \r\n]*$/.test(gap)) return;
          const text = /[\r\n]/.test(gap)
            ? gap.replace(/[\t ]*$/, nextIndent)
            : newline + nextIndent;
          if (text !== gap) edits.set(range.join(':'), { range, text });
        };
        const open = sourceCode.getFirstToken(options);
        const close = sourceCode.getLastToken(options);
        separate(open, sourceCode.getTokenAfter(open, { includeComments: true }), indent + unit);
        for (const property of options.properties) {
          separate(sourceCode.getTokenBefore(property, { includeComments: true }), property, indent + unit);
        }
        separate(sourceCode.getTokenBefore(close, { includeComments: true }), close, indent);
        if (!edits.size) return;

        context.report({
          node: options,
          messageId: 'layout',
          fix: (fixer) => [...edits.values()].map(({ range, text }) => fixer.replaceTextRange(range, text)),
        });
      },
    };
  },
};
