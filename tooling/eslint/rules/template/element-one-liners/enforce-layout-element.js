import { preservesElementWhitespace, reportElementOneLiner } from '../../../helpers/enforce-element-one-liner.js';

const createElementLayoutRule = ({ components, exclude = [], excludeTextOnly = [] } = {}) => ({
  meta: {
    type: 'layout',
    docs: { description: 'format template elements according to their content' },
    fixable: 'whitespace',
    schema: [],
    messages: {
      inline: 'Keep text-only <{{ component }}> on one line.',
      multiline: 'Put nested <{{ component }}> content on separate lines between its tags.',
      manualMultiline: 'Reformat nested <{{ component }}> content onto separate lines while preserving its rendered text and spacing. No autofix is offered because these line breaks could add or remove visible spaces around inline content.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const parserServices = sourceCode.parserServices;
    const tokenStore = parserServices.getTemplateBodyTokenStore?.();
    if (!parserServices.defineTemplateBodyVisitor || !tokenStore) return {};

    const newline = sourceCode.text.includes('\r\n') ? '\r\n' : '\n';
    const indentation = (node) => sourceCode.lines[node.loc.start.line - 1].match(/^[\t ]*/)[0];

    return parserServices.defineTemplateBodyVisitor({
      VElement(node) {
        if (!node.endTag || (components && !components.includes(node.rawName))
          || exclude.includes(node.rawName) || preservesElementWhitespace(node)) return;

        const elements = node.children.filter((child) => child.type === 'VElement');
        const start = node.startTag.range[1];
        const end = node.endTag.range[0];
        const comments = tokenStore.getTokens(node, { includeComments: true }).filter((token) => token.type === 'HTMLComment'
          && token.range[0] >= start && token.range[1] <= end
          && !elements.some((child) => token.range[0] >= child.range[0] && token.range[1] <= child.range[1]));
        const markup = [...elements, ...comments].sort((left, right) => left.range[0] - right.range[0]);

        if (!markup.length) {
          if (excludeTextOnly.includes(node.rawName) || node.loc.start.line === node.loc.end.line) return;

          reportElementOneLiner(context, node, tokenStore);
          return;
        }

        const indent = indentation(node);
        const parentIndent = node.parent?.type === 'VElement' ? indentation(node.parent) : '';
        const childIndent = elements.map(indentation).find((value) => value.startsWith(indent) && value.length > indent.length);
        const indentUnit = indent.startsWith(parentIndent) && indent.length > parentIndent.length
          ? indent.slice(parentIndent.length)
          : childIndent ? childIndent.slice(indent.length) : indent.includes('\t') ? '\t' : '  ';
        const segments = [];
        const appendText = (from, to) => {
          const text = sourceCode.text.slice(from, to);
          if (!text.trim()) return;

          // Keep text and interpolations together without changing their contents.
          segments.push([
            from + text.match(/^[\t \r\n]*/)[0].length,
            to - text.match(/[\t \r\n]*$/)[0].length,
          ]);
        };
        let offset = start;

        for (const child of markup) {
          appendText(offset, child.range[0]);
          segments.push(child.range);
          offset = child.range[1];
        }
        appendText(offset, end);

        const edits = [];
        let changesInlineSpacing = node.children.some((child) => child.type === 'VExpressionContainer'
          || (child.type === 'VText' && child.value.trim()));
        const separate = (from, to, nextIndent) => {
          const gap = sourceCode.text.slice(from, to);
          // Never replace source code or copy a preceding tag as indentation.
          if (!/^[\t \r\n]*$/.test(gap)) return;

          // Vue removes newline-only gaps between child elements, but preserves
          // a single-line space. Do not turn an intentional separator into nothing.
          if (from > start && to < end && gap.length && !/[\r\n]/.test(gap)) changesInlineSpacing = true;

          const replacement = /[\r\n]/.test(gap)
            ? gap.replace(/[\t ]*$/, nextIndent)
            : `${newline}${nextIndent}`;
          if (gap !== replacement) edits.push({ range: [from, to], text: replacement });
        };
        offset = start;

        for (const segment of segments) {
          separate(offset, segment[0], indent + indentUnit);
          offset = segment[1];
        }
        separate(offset, end, indent);
        if (!edits.length) return;

        context.report({
          loc: node.loc,
          messageId: changesInlineSpacing ? 'manualMultiline' : 'multiline',
          data: { component: node.rawName },
          fix: changesInlineSpacing ? undefined : (fixer) => edits.map((edit) => fixer.replaceTextRange(edit.range, edit.text)),
        });
      },
    });
  },
});

export default createElementLayoutRule({
  excludeTextOnly: [
    'Button', 'button',
    'DialogDescription', 'dialog-description', 'EmptyDescription', 'empty-description',
  ],
  exclude: ['TableHead', 'table-head', 'TableCell', 'table-cell'],
});
