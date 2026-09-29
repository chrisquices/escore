import { getStandaloneTemplateComment, insertStandaloneTemplateComment, safeTemplateCommentText } from '../../../helpers/require-element-comment.js';

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'require table cell comments to match their column header comments',
    },
    fixable: 'code',
    schema: [],
    messages: {
      missing: 'Add a nonempty HTML comment on its own line immediately above <TableCell>, with no blank line between them. {{ requirement }}',
      mismatch: 'The comment above <TableCell> must match the column {{ column }} header comment "{{ expected }}".',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const parserServices = sourceCode.parserServices;
    const tokenStore = parserServices.getTemplateBodyTokenStore?.();

    // This rule only runs for Vue templates parsed by vue-eslint-parser.
    if (!parserServices.defineTemplateBodyVisitor || !tokenStore) {
      return {};
    }

    // Column comments are valid only when they directly precede the component.
    const getDirectComment = (node) => getStandaloneTemplateComment(sourceCode, tokenStore, node);
    const findDescendants = (root, componentName) => {
      const matches = [];
      const visit = (element) => {
        for (const child of element.children) {
          if (child.type !== 'VElement' || child.rawName === 'Table') {
            continue;
          }

          if (child.rawName === componentName) {
            matches.push(child);
          }

          visit(child);
        }
      };

      visit(root);

      return matches;
    };
    const getRowColumns = (row, componentName) => row.children.filter(
      (child) => child.type === 'VElement' && child.rawName === componentName,
    );
    const hasComplexColumnStructure = (column) => column.startTag.attributes.some((attribute) => {
      if (!attribute.directive) {
        return attribute.key.name === 'colspan';
      }

      const directiveName = attribute.key.name.name;

      if (['if', 'else-if', 'else', 'for'].includes(directiveName)) {
        return true;
      }

      return directiveName === 'bind' && attribute.key.argument?.type === 'VIdentifier' && attribute.key.argument.name === 'colspan';
    });

    return parserServices.defineTemplateBodyVisitor({
      VElement(node) {
        if (node.rawName !== 'Table') {
          return;
        }

        // A simple header row is the source of truth for matching body-cell comments.
        // Tables with conditionals, loops, or colspans are intentionally skipped because
        // their visual column order cannot be determined safely from the template AST.
        const tableCells = findDescendants(node, 'TableCell');
        const expectations = new Map();
        const tableHeaders = findDescendants(node, 'TableHeader');
        const tableBodies = findDescendants(node, 'TableBody');

        if (tableHeaders.length === 1 && tableBodies.length) {
          const headerRows = findDescendants(tableHeaders[0], 'TableRow');

          if (headerRows.length === 1) {
            const headers = getRowColumns(headerRows[0], 'TableHead');

            if (headers.length && !headers.some(hasComplexColumnStructure)) {
              const headerComments = headers.map(getDirectComment);

              if (headerComments.every(Boolean)) {
                const expectedComments = headerComments.map((comment) => safeTemplateCommentText(comment.value.trim()));

                for (const tableBody of tableBodies) {
                  for (const row of findDescendants(tableBody, 'TableRow')) {
                    const cells = getRowColumns(row, 'TableCell');

                    if (cells.length !== headers.length || cells.some(hasComplexColumnStructure)) {
                      continue;
                    }

                    cells.forEach((cell, index) => {
                      expectations.set(cell, {
                        column: index + 1,
                        text: expectedComments[index],
                      });
                    });
                  }
                }
              }
            }
          }
        }

        // Cells without a safe header mapping still require a comment, but get no autofix.
        for (const cell of tableCells) {
          const cellComment = getDirectComment(cell);
          const expectation = expectations.get(cell);

          if (!cellComment) {
            context.report({
              loc: cell.startTag.loc,
              messageId: 'missing',
              data: {
                requirement: expectation
                  ? `Use <!-- ${expectation.text} --> to match column ${expectation.column}'s header comment.`
                  : 'Describe this cell\'s column or purpose; the header mapping cannot be inferred safely.',
              },
              fix: expectation
                ? (fixer) => insertStandaloneTemplateComment(fixer, sourceCode, cell, expectation.text)
                : undefined,
            });

            continue;
          }

          if (!expectation || cellComment.value.trim() === expectation.text) {
            continue;
          }

          context.report({
            loc: cellComment.loc,
            messageId: 'mismatch',
            data: {
              column: expectation.column,
              expected: expectation.text,
            },
            fix: (fixer) => fixer.replaceText(cellComment, `<!-- ${expectation.text} -->`),
          });
        }
      },
    });
  },
};
