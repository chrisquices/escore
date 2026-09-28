// Require a comment above the second written row; a v-for counts as one row.
export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'require a standalone comment above the second TableRow in a TableBody' },
    schema: [],
    messages: { missing: 'Add a standalone HTML comment directly above the second <TableRow> in this <TableBody>.' },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const parserServices = sourceCode.parserServices;
    const tokenStore = parserServices.getTemplateBodyTokenStore?.();
    if (!parserServices.defineTemplateBodyVisitor || !tokenStore) return {};

    return parserServices.defineTemplateBodyVisitor({
      VElement(node) {
        if (!['TableBody', 'table-body'].includes(node.rawName)) return;

        const rows = [];
        const collectRows = (element) => {
          for (const child of element.children) {
            if (child.type !== 'VElement') continue;
            // Nested tables and their bodies own their own rows.
            if (['Table', 'table', 'TableBody', 'table-body', 'tbody'].includes(child.rawName)) continue;

            if (['TableRow', 'table-row'].includes(child.rawName)) {
              rows.push(child);
            } else {
              collectRows(child);
            }
          }
        };

        collectRows(node);
        const secondRow = rows[1];
        if (!secondRow) return;

        let comment = tokenStore.getTokenBefore(secondRow, { includeComments: true });
        while (comment?.type === 'HTMLWhitespace') {
          comment = tokenStore.getTokenBefore(comment, { includeComments: true });
        }

        const hasComment = comment?.type === 'HTMLComment'
          && Boolean(comment.value.trim())
          && comment.loc.end.line === secondRow.loc.start.line - 1
          && !sourceCode.lines[comment.loc.start.line - 1].slice(0, comment.loc.start.column).trim()
          && !sourceCode.lines[comment.loc.end.line - 1].slice(comment.loc.end.column).trim();

        if (!hasComment) {
          context.report({ loc: secondRow.startTag.loc, messageId: 'missing' });
        }
      },
    });
  },
};
