import { getStandaloneTemplateComment } from '../../../helpers/require-element-comment.js';

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

        const hasComment = getStandaloneTemplateComment(sourceCode, tokenStore, secondRow);

        if (!hasComment) {
          context.report({ loc: secondRow.startTag.loc, messageId: 'missing' });
        }
      },
    });
  },
};
