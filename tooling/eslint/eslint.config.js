import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import inertiaPlusRules from './rules/inertia-plus.js';

const requireCommentBeforeComponent = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'require a standalone comment directly before configured Vue components',
    },
    fixable: 'code',
    schema: [
      {
        type: 'object',
        properties: {
          components: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                autofix: {
                  type: 'string',
                  enum: ['missing-only', 'replace'],
                },
                equals: {
                  type: 'string',
                  minLength: 1,
                },
                endsWith: {
                  type: 'string',
                  minLength: 1,
                },
                matchesLiteralText: {
                  type: 'boolean',
                },
                matchesDescendantText: {
                  oneOf: [
                    {
                      type: 'string',
                      minLength: 1,
                    },
                    {
                      type: 'array',
                      items: {
                        type: 'string',
                        minLength: 1,
                      },
                      minItems: 1,
                    },
                  ],
                },
                notWithin: {
                  oneOf: [
                    {
                      type: 'string',
                      minLength: 1,
                    },
                    {
                      type: 'array',
                      items: {
                        type: 'string',
                        minLength: 1,
                      },
                      minItems: 1,
                    },
                  ],
                },
                sourceComponent: {
                  type: 'string',
                  minLength: 1,
                },
                sourceTraversal: {
                  type: 'string',
                  enum: ['native-only'],
                },
                sourceTextTransform: {
                  type: 'string',
                  enum: ['title-case'],
                },
                suffix: {
                  type: 'string',
                  minLength: 1,
                },
                within: {
                  type: 'string',
                  minLength: 1,
                },
              },
              additionalProperties: false,
            },
            minProperties: 1,
          },
        },
        additionalProperties: false,
        required: ['components'],
      },
    ],
    messages: {
      expected: 'Expected a standalone HTML comment directly above <{{ component }}>.',
      expectedExact: 'The comment above <{{ component }}> must be exactly "{{ text }}".',
      expectedSuffix: 'The comment above <{{ component }}> must end with "{{ suffix }}".',
      expectedDescendantText: 'The comment above <{{ component }}> must match literal text inside <{{ descendant }}>.',
      expectedSourceText: 'The comment above <{{ component }}> must be "{{ text }}" based on <{{ source }}>.',
      expectedText: 'The comment above <{{ component }}> must match literal text inside it.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const parserServices = sourceCode.parserServices;
    const tokenStore = parserServices.getTemplateBodyTokenStore?.();

    // These rules depend on vue-eslint-parser's template AST and token store.
    if (!parserServices.defineTemplateBodyVisitor || !tokenStore) {
      return {};
    }

    // Component behaviour is configured by the consuming app, not hard-coded here.
    const components = context.options[0]?.components ?? {};
    // "native-only" inference may traverse these tags, but never another component.
    const nativeHtmlElements = new Set([
      'a',
      'abbr',
      'b',
      'bdi',
      'bdo',
      'cite',
      'code',
      'data',
      'del',
      'div',
      'em',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'i',
      'ins',
      'kbd',
      'label',
      'mark',
      'p',
      'q',
      's',
      'samp',
      'small',
      'span',
      'strong',
      'sub',
      'sup',
      'time',
      'u',
      'var',
    ]);
    const isWithinComponent = (node, componentName) => {
      let parent = node.parent;

      while (parent) {
        if (parent.type === 'VElement' && parent.rawName === componentName) {
          return true;
        }

        parent = parent.parent;
      }

      return false;
    };
    const getLiteralTexts = (element) => {
      const literalTexts = new Set();
      let hasDynamicText = false;
      const collectLiteralTexts = (currentElement) => {
        for (const child of currentElement.children) {
          if (child.type === 'VText') {
            const text = child.value.replace(/\s+/g, ' ').trim();

            if (text) {
              literalTexts.add(text);
            }
          } else if (child.type === 'VExpressionContainer') {
            hasDynamicText = true;
          } else if (child.type === 'VElement') {
            collectLiteralTexts(child);
          }
        }
      };

      collectLiteralTexts(element);

      return hasDynamicText ? [] : [...literalTexts];
    };
    const getDescendantLiteralTexts = (element, componentName) => {
      const literalTexts = new Set();
      let exists = false;
      const visit = (currentElement) => {
        for (const child of currentElement.children) {
          if (child.type !== 'VElement') {
            continue;
          }

          if (child.rawName === componentName) {
            exists = true;
            getLiteralTexts(child).forEach((text) => literalTexts.add(text));
          }

          visit(child);
        }
      };

      visit(element);

      return {
        exists,
        literalTexts: [...literalTexts],
      };
    };
    const getNativeOnlyText = (element) => {
      const fragments = [];
      let hasDynamicText = false;
      const visit = (currentElement) => {
        for (const child of currentElement.children) {
          if (child.type === 'VText') {
            const text = child.value.replace(/\s+/g, ' ').trim();

            if (text) {
              fragments.push(text);
            }
          } else if (child.type === 'VExpressionContainer') {
            hasDynamicText = true;
          } else if (child.type === 'VElement' && nativeHtmlElements.has(child.rawName)) {
            visit(child);
          }
        }
      };

      // Dynamic content cannot produce a trustworthy comment, so it is never inferred.
      visit(element);

      if (hasDynamicText || !fragments.length) {
        return undefined;
      }

      return fragments.join(' ').replace(/\s+/g, ' ').trim();
    };
    const getSourceText = (element, componentName) => {
      const sources = [];
      const visit = (currentElement) => {
        for (const child of currentElement.children) {
          if (child.type !== 'VElement' || child.rawName === element.rawName) {
            continue;
          }

          if (child.rawName === componentName) {
            sources.push(child);
          } else {
            visit(child);
          }
        }
      };

      visit(element);

      // A source must be unique; multiple labels or no label require a manual comment.
      if (sources.length !== 1) {
        return undefined;
      }

      return getNativeOnlyText(sources[0]);
    };
    const transformSourceText = (text, transform) => {
      if (transform !== 'title-case') {
        return text;
      }

      return text.replace(/\b[\p{L}\p{N}]/gu, (character) => character.toUpperCase());
    };

    return parserServices.defineTemplateBodyVisitor({
      VElement(node) {
        const componentOptions = components[node.rawName];

        // `within` and `notWithin` limit a rule to its intended template context.
        if (
          !componentOptions ||
          (componentOptions.within && !isWithinComponent(node, componentOptions.within)) ||
          (componentOptions.notWithin && [componentOptions.notWithin].flat().some((componentName) => isWithinComponent(node, componentName)))
        ) {
          return;
        }

        const descendantTextComponents = componentOptions.matchesDescendantText
          ? [componentOptions.matchesDescendantText].flat()
          : [];
        // Component arrays are ordered fallbacks; the first descendant that exists wins.
        const descendantTextMatch = descendantTextComponents
          .map((componentName) => ({
            componentName,
            ...getDescendantLiteralTexts(node, componentName),
          }))
          .find(({ exists }) => exists);
        const literalTexts = descendantTextComponents.length
          ? descendantTextMatch?.literalTexts ?? []
          : componentOptions.matchesLiteralText
            ? getLiteralTexts(node)
            : [];
        const rawSourceText = componentOptions.sourceComponent && componentOptions.sourceTraversal === 'native-only'
          ? getSourceText(node, componentOptions.sourceComponent)
          : undefined;
        const sourceText = rawSourceText
          ? transformSourceText(rawSourceText, componentOptions.sourceTextTransform)
          : undefined;
        const inferredText = sourceText
          ? componentOptions.suffix && !sourceText.endsWith(componentOptions.suffix)
            ? `${sourceText} ${componentOptions.suffix}`
            : sourceText
          : literalTexts.length === 1
            ? literalTexts[0]
            : undefined;
        const autofixText = componentOptions.equals ?? inferredText;
        const canCreateComment = ['missing-only', 'replace'].includes(componentOptions.autofix);
        const canReplaceComment = componentOptions.autofix === 'replace';

        let previousToken = tokenStore.getTokenBefore(node, {
          includeComments: true,
        });

        while (previousToken?.type === 'HTMLWhitespace') {
          previousToken = tokenStore.getTokenBefore(previousToken, {
            includeComments: true,
          });
        }

        const startsOnOwnLine =
          previousToken?.type === 'HTMLComment' &&
          !sourceCode.lines[previousToken.loc.start.line - 1].slice(0, previousToken.loc.start.column).trim();
        const endsOnOwnLine =
          previousToken?.type === 'HTMLComment' &&
          !sourceCode.lines[previousToken.loc.end.line - 1].slice(previousToken.loc.end.column).trim();
        const isDirectlyAbove = previousToken?.loc.end.line === node.loc.start.line - 1;

        // A valid comment must occupy its own line immediately above the component.
        if (!startsOnOwnLine || !endsOnOwnLine || !isDirectlyAbove) {
          context.report({
            loc: node.startTag.loc,
            messageId: 'expected',
            data: {
              component: node.rawName,
            },
            fix: canCreateComment && autofixText
              ? (fixer) => {
                  const indentation = sourceCode.lines[node.loc.start.line - 1].slice(0, node.loc.start.column);

                  return fixer.insertTextBeforeRange(
                    [node.range[0], node.range[0]],
                    `<!-- ${autofixText} -->\n${indentation}`,
                  );
                }
              : undefined,
          });

          return;
        }

        const commentText = previousToken.value.trim();

        // Source text wins over generic literal text when both are configured.
        if (componentOptions.sourceComponent && inferredText && commentText !== inferredText) {
          context.report({
            loc: previousToken.loc,
            messageId: 'expectedSourceText',
            data: {
              component: node.rawName,
              source: componentOptions.sourceComponent,
              text: inferredText,
            },
            fix: canReplaceComment
              ? (fixer) => fixer.replaceText(previousToken, `<!-- ${inferredText} -->`)
              : undefined,
          });

          return;
        }

        if (componentOptions.equals && commentText !== componentOptions.equals) {
          context.report({
            loc: previousToken.loc,
            messageId: 'expectedExact',
            data: {
              component: node.rawName,
              text: componentOptions.equals,
            },
            fix: canReplaceComment
              ? (fixer) => fixer.replaceText(previousToken, `<!-- ${componentOptions.equals} -->`)
              : undefined,
          });

          return;
        }

        if (componentOptions.endsWith && !commentText.endsWith(componentOptions.endsWith)) {
          context.report({
            loc: previousToken.loc,
            messageId: 'expectedSuffix',
            data: {
              component: node.rawName,
              suffix: componentOptions.endsWith,
            },
          });
        }

        if (componentOptions.sourceComponent && !inferredText && componentOptions.suffix && !commentText.endsWith(componentOptions.suffix)) {
          context.report({
            loc: previousToken.loc,
            messageId: 'expectedSuffix',
            data: {
              component: node.rawName,
              suffix: componentOptions.suffix,
            },
          });
        }

        if (componentOptions.matchesLiteralText || componentOptions.matchesDescendantText) {
          if (literalTexts.length && !literalTexts.includes(commentText)) {
            context.report({
              loc: previousToken.loc,
              messageId: componentOptions.matchesDescendantText ? 'expectedDescendantText' : 'expectedText',
              data: {
                component: node.rawName,
                descendant: descendantTextMatch?.componentName ?? descendantTextComponents[0],
              },
              fix: canReplaceComment && inferredText
                ? (fixer) => fixer.replaceText(previousToken, `<!-- ${inferredText} -->`)
                : undefined,
            });
          }
        }
      },
    });
  },
};

// -----------------------------------------------------------------------------
// Rule: table-body-second-row-comment
// Identify the second TableRow written in each TableBody with a comment.
// A v-for counts as one template row. No autofix: the row's purpose is unknown.
// -----------------------------------------------------------------------------

const tableBodySecondRowComment = {
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

const tableCellCommentConsistency = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'require table cell comments to match their column header comments',
    },
    fixable: 'code',
    schema: [],
    messages: {
      missing: 'Expected a standalone HTML comment directly above <TableCell>.',
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
    const getDirectComment = (node) => {
      let previousToken = tokenStore.getTokenBefore(node, {
        includeComments: true,
      });

      while (previousToken?.type === 'HTMLWhitespace') {
        previousToken = tokenStore.getTokenBefore(previousToken, {
          includeComments: true,
        });
      }

      if (previousToken?.type !== 'HTMLComment' || previousToken.loc.end.line !== node.loc.start.line - 1) {
        return undefined;
      }

      return previousToken;
    };
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
                const expectedComments = headerComments.map((comment) => comment.value.trim());

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
              fix: expectation
                ? (fixer) => {
                    const indentation = sourceCode.lines[cell.loc.start.line - 1].slice(0, cell.loc.start.column);

                    return fixer.insertTextBeforeRange(
                      [cell.range[0], cell.range[0]],
                      `<!-- ${expectation.text} -->\n${indentation}`,
                    );
                  }
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

// -----------------------------------------------------------------------------
// Shared helper: multiline component content
// Autofix boundary whitespace; expand empty self-closing elements onto two lines.
// -----------------------------------------------------------------------------

const createMultilineContentRule = (components) => ({
  meta: {
    type: 'layout',
    docs: { description: `require multiline ${components[0]} contents regardless of length` },
    fixable: 'code',
    schema: [],
    messages: { newline: 'Put <{{ component }}> content on separate lines between its opening and closing tags.' },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const parserServices = sourceCode.parserServices;
    if (!parserServices.defineTemplateBodyVisitor) return {};

    const newline = sourceCode.text.includes('\r\n') ? '\r\n' : '\n';
    const indentation = (node) => sourceCode.lines[node.loc.start.line - 1].match(/^[\t ]*/)[0];

    return parserServices.defineTemplateBodyVisitor({
      VElement(node) {
        if (!components.includes(node.rawName)) return;
        if (!node.startTag.selfClosing && !node.endTag) return;

        const content = node.endTag
          ? sourceCode.text.slice(node.startTag.range[1], node.endTag.range[0])
          : '';
        const hasLeadingNewline = /^[\t ]*(?:\r\n|\r|\n)/.test(content);
        const hasTrailingNewline = /(?:\r\n|\r|\n)[\t ]*$/.test(content);
        if (hasLeadingNewline && hasTrailingNewline) return;

        context.report({
          loc: node.loc,
          messageId: 'newline',
          data: { component: node.rawName },
          fix(fixer) {
            const indent = indentation(node);
            const parentIndent = node.parent?.type === 'VElement' ? indentation(node.parent) : '';
            const indentUnit = indent.startsWith(parentIndent) && indent.length > parentIndent.length
              ? indent.slice(parentIndent.length)
              : indent.includes('\t') ? '\t' : '  ';

            if (node.startTag.selfClosing) {
              const ending = sourceCode.getText(node.startTag).match(/[\t ]*\/>$/);
              if (!ending) return null;

              return fixer.replaceTextRange(
                [node.startTag.range[1] - ending[0].length, node.startTag.range[1]],
                `>${newline}${indent}</${node.rawName}>`,
              );
            }

            const start = node.startTag.range[1];
            const end = node.endTag.range[0];
            if (!content.trim()) {
              return fixer.replaceTextRange([start, end], `${newline}${indent}`);
            }

            const fixes = [];
            if (!hasLeadingNewline) {
              const spaces = content.match(/^[\t ]*/)[0].length;
              fixes.push(fixer.replaceTextRange([start, start + spaces], `${newline}${indent}${indentUnit}`));
            }
            if (!hasTrailingNewline) {
              const spaces = content.match(/[\t ]*$/)[0].length;
              fixes.push(fixer.replaceTextRange([end - spaces, end], `${newline}${indent}`));
            }

            return fixes;
          },
        });
      },
    });
  },
});

// -----------------------------------------------------------------------------
// Rule: table-cell-content-newline
// Always put TableCell content on separate lines, regardless of its length.
// -----------------------------------------------------------------------------

const tableCellContentNewline = createMultilineContentRule(['TableCell', 'table-cell']);

// -----------------------------------------------------------------------------
// Rule: table-head-content-newline
// Always put TableHead content on separate lines, regardless of its length.
// -----------------------------------------------------------------------------

const tableHeadContentNewline = createMultilineContentRule(['TableHead', 'table-head']);

// -----------------------------------------------------------------------------
// Rule: vue-no-multiple-empty-lines
// Keep at most one consecutive blank line in Vue scripts and templates.
// Preserve literal content, comments, pre/textarea, and raw SFC blocks.
// -----------------------------------------------------------------------------

const vueNoMultipleEmptyLines = {
  meta: {
    type: 'layout',
    docs: { description: 'collapse consecutive blank lines in Vue files' },
    fixable: 'whitespace',
    schema: [],
    messages: { extra: 'Keep at most one consecutive blank line.' },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const documentFragment = sourceCode.parserServices.getDocumentFragment?.();
    if (!documentFragment) return {};

    const protectedLines = new Set();
    const preserve = (node) => {
      if (!node?.loc) return;
      for (let line = node.loc.start.line; line <= node.loc.end.line; line++) {
        protectedLines.add(line);
      }
    };

    const preserveTemplateContent = (node) => {
      if (node.type === 'VExpressionContainer') {
        // Template expressions can contain multiline literals and comments.
        preserve(node);
        return;
      }
      if (node.type !== 'VElement') return;

      if (['pre', 'textarea'].includes(node.rawName)
        || node.startTag.attributes.some((attribute) => attribute.directive && attribute.key.name.name === 'pre')) {
        preserve(node);
        return;
      }

      // Attribute values can contain whitespace-sensitive strings or expressions.
      for (const attribute of node.startTag.attributes) preserve(attribute.value);
      for (const child of node.children) preserveTemplateContent(child);
    };

    return {
      TemplateLiteral: preserve,
      Literal(node) {
        if (typeof node.value === 'string') preserve(node);
      },
      'Program:exit'() {
        for (const comment of sourceCode.getAllComments()) preserve(comment);
        for (const comment of documentFragment.comments ?? []) preserve(comment);

        for (const block of documentFragment.children) {
          if (block.type !== 'VElement') continue;
          if (block.rawName === 'template') preserveTemplateContent(block);
          else if (block.rawName !== 'script') preserve(block);
          else for (const attribute of block.startTag.attributes) preserve(attribute.value);
        }

        const lines = sourceCode.lines;
        // A terminal newline creates a virtual empty line, not an extra blank line.
        const count = lines.length - (lines.at(-1) === '' ? 1 : 0);
        let firstBlank;

        for (let index = 0; index <= count; index++) {
          if (index < count && /^[\t ]*$/.test(lines[index]) && !protectedLines.has(index + 1)) {
            firstBlank ??= index;
            continue;
          }

          if (firstBlank !== undefined && index - firstBlank > 1) {
            const start = { line: firstBlank + 2, column: 0 };
            const startOffset = sourceCode.getIndexFromLoc(start);
            const endOffset = index < lines.length
              ? sourceCode.getIndexFromLoc({ line: index + 1, column: 0 })
              : sourceCode.text.length;

            context.report({
              loc: { start, end: sourceCode.getLocFromIndex(endOffset) },
              messageId: 'extra',
              fix: (fixer) => fixer.removeRange([startOffset, endOffset]),
            });
          }

          firstBlank = undefined;
        }
      },
    };
  },
};

const templateCommentPadding = {
  meta: {
    type: 'layout',
    docs: {
      description: 'require a blank line before standalone comments in Vue templates',
    },
    fixable: 'whitespace',
    schema: [],
    messages: {
      expected: 'Expected a blank line before this template comment.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const documentFragment = sourceCode.parserServices.getDocumentFragment?.();

    // Vue template comments are exposed from the document fragment, not Program comments.
    if (!documentFragment) {
      return {};
    }

    return {
      'Program:exit'() {
        for (const comment of documentFragment.comments) {
          if (comment.type !== 'HTMLComment') {
            continue;
          }

          const lineIndex = comment.loc.start.line - 1;

          if (lineIndex === 0) {
            continue;
          }

          const contentBeforeComment = sourceCode.lines[lineIndex].slice(0, comment.loc.start.column);

          // Only standalone comments need separation; inline comments keep their layout.
          if (contentBeforeComment.trim() || !sourceCode.lines[lineIndex - 1].trim()) {
            continue;
          }

          context.report({
            loc: comment.loc,
            messageId: 'expected',
            fix(fixer) {
              const lineStart = sourceCode.getIndexFromLoc({
                line: comment.loc.start.line,
                column: 0,
              });

              return fixer.insertTextBeforeRange([lineStart, lineStart], '\n');
            },
          });
        }
      },
    };
  },
};

const isDialogComponent = (node) => node.type === 'VElement'
  && ['Dialog', 'AlertDialog', 'alert-dialog'].includes(node.rawName);

const dialogSectionPadding = {
  meta: {
    type: 'layout',
    docs: {
      description: 'require blank lines after DialogHeader and before DialogFooter',
    },
    fixable: 'whitespace',
    schema: [],
    messages: {
      afterHeader: 'Expected a blank line after </DialogHeader>.',
      beforeFooter: 'Expected a blank line before <DialogFooter>.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const parserServices = sourceCode.parserServices;

    if (!parserServices.defineTemplateBodyVisitor) {
      return {};
    }

    const newline = sourceCode.text.includes('\r\n') ? '\r\n' : '\n';
    const requireBlankLine = (gap, offset, loc, messageId) => {
      const lineBreaks = (gap.match(/\r\n|\r|\n/g) ?? []).length;

      if (lineBreaks >= 2) {
        return;
      }

      context.report({
        loc,
        messageId,
        fix: (fixer) => fixer.insertTextBeforeRange(
          [offset, offset],
          newline.repeat(2 - lineBreaks),
        ),
      });
    };

    return parserServices.defineTemplateBodyVisitor({
      VElement(node) {
        if (['DialogHeader', 'dialog-header'].includes(node.rawName) && node.endTag) {
          const offset = node.endTag.range[1];
          const gap = sourceCode.text.slice(offset).match(/^\s*/)[0];

          requireBlankLine(gap, offset, node.endTag.loc, 'afterHeader');
        }

        if (['DialogFooter', 'dialog-footer'].includes(node.rawName)) {
          const offset = node.startTag.range[0];
          const gap = sourceCode.text.slice(0, offset).match(/\s*$/)[0];

          requireBlankLine(gap, offset - gap.length, node.startTag.loc, 'beforeFooter');
        }
      },
    });
  },
};

// -----------------------------------------------------------------------------
// Shared helper: description layout
// Text-only descriptions stay on one line; nested markup uses separate lines.
// Autofix whitespace without rewriting expressions or nested elements.
// -----------------------------------------------------------------------------

const createDescriptionLayoutRule = (components) => ({
  meta: {
    type: 'layout',
    docs: { description: `format ${components[0]} according to its content` },
    fixable: 'whitespace',
    schema: [],
    messages: {
      inline: 'Keep text-only <{{ component }}> on one line.',
      multiline: 'Put nested <{{ component }}> content on separate lines between its tags.',
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
        if (!components.includes(node.rawName) || !node.endTag) return;

        const hasMarkup = node.children.some((child) => child.type === 'VElement')
          || tokenStore.getTokens(node, { includeComments: true }).some((token) => token.type === 'HTMLComment');
        const start = node.startTag.range[1];
        const end = node.endTag.range[0];
        const content = sourceCode.text.slice(start, end);

        if (!hasMarkup) {
          if (node.loc.start.line === node.loc.end.line) return;

          context.report({
            loc: node.loc,
            messageId: 'inline',
            data: { component: node.rawName },
            fix(fixer) {
              // Leave multiline attributes and expressions for manual formatting.
              if (node.startTag.loc.start.line !== node.startTag.loc.end.line
                || node.endTag.loc.start.line !== node.endTag.loc.end.line
                || node.children.some((child) => child.type !== 'VText'
                  && (child.type !== 'VExpressionContainer' || child.loc.start.line !== child.loc.end.line))) {
                return null;
              }

              const text = node.children.map((child) => child.type === 'VText'
                ? sourceCode.getText(child).replace(/[\t \r\n]+/g, ' ')
                : sourceCode.getText(child)).join('').trim();

              return fixer.replaceTextRange([start, end], text);
            },
          });
          return;
        }

        const hasLeadingNewline = /^[\t ]*(?:\r\n|\r|\n)/.test(content);
        const hasTrailingNewline = /(?:\r\n|\r|\n)[\t ]*$/.test(content);
        if (hasLeadingNewline && hasTrailingNewline) return;

        context.report({
          loc: node.loc,
          messageId: 'multiline',
          data: { component: node.rawName },
          fix(fixer) {
            const indent = indentation(node);
            const parentIndent = node.parent?.type === 'VElement' ? indentation(node.parent) : '';
            const indentUnit = indent.startsWith(parentIndent) && indent.length > parentIndent.length
              ? indent.slice(parentIndent.length)
              : indent.includes('\t') ? '\t' : '  ';
            const fixes = [];

            if (!hasLeadingNewline) {
              const spaces = content.match(/^[\t ]*/)[0].length;
              fixes.push(fixer.replaceTextRange([start, start + spaces], `${newline}${indent}${indentUnit}`));
            }
            if (!hasTrailingNewline) {
              const spaces = content.match(/[\t ]*$/)[0].length;
              fixes.push(fixer.replaceTextRange([end - spaces, end], `${newline}${indent}`));
            }

            return fixes;
          },
        });
      },
    });
  },
});

// -----------------------------------------------------------------------------
// Rule: dialog-description-layout
// Keep plain text inline; use separate lines when nested markup is present.
// -----------------------------------------------------------------------------

const dialogDescriptionLayout = createDescriptionLayoutRule(['DialogDescription', 'dialog-description']);

// -----------------------------------------------------------------------------
// Rule: empty-description-layout
// Keep plain text inline; use separate lines when nested markup is present.
// -----------------------------------------------------------------------------

const emptyDescriptionLayout = createDescriptionLayoutRule(['EmptyDescription', 'empty-description']);

const createDialogOpenRequirement = (directiveName, argumentName) => {
  const attributeName = `${directiveName === 'bind' ? ':' : '@'}${argumentName}`;

  return {
    meta: {
      type: 'problem',
      docs: { description: `require ${attributeName} when Dialog binds :open` },
      schema: [],
      messages: { missing: `<Dialog> with :open also requires ${attributeName}.` },
    },

    create(context) {
      const parserServices = context.sourceCode.parserServices;
      if (!parserServices.defineTemplateBodyVisitor) return {};

      const hasDirective = (node, directive, argument) => node.startTag.attributes.some((attribute) =>
        attribute.directive
        && attribute.key.name.name === directive
        && attribute.key.argument?.type === 'VIdentifier'
        && attribute.key.argument.name === argument);

      return parserServices.defineTemplateBodyVisitor({
        VElement(node) {
          if (node.rawName !== 'Dialog' || !hasDirective(node, 'bind', 'open')) return;

          if (!hasDirective(node, directiveName, argumentName)) {
            context.report({ loc: node.startTag.loc, messageId: 'missing' });
          }
        },
      });
    },
  };
};

// -----------------------------------------------------------------------------
// Rule: dialog-open-requires-processing
// A Dialog with :open must also bind :processing. No behavioral autofix.
// -----------------------------------------------------------------------------

const dialogOpenRequiresProcessing = createDialogOpenRequirement('bind', 'processing');

// -----------------------------------------------------------------------------
// Rule: dialog-open-requires-dismissible
// A Dialog with :open must also bind :dismissible. No behavioral autofix.
// -----------------------------------------------------------------------------

const dialogOpenRequiresDismissible = createDialogOpenRequirement('bind', 'dismissible');

// -----------------------------------------------------------------------------
// Rule: dialog-open-requires-update-open
// A Dialog with :open must also handle @update:open. No behavioral autofix.
// -----------------------------------------------------------------------------

const dialogOpenRequiresUpdateOpen = createDialogOpenRequirement('on', 'update:open');

// -----------------------------------------------------------------------------
// Rule: dialog-footer-close-as-child
// DialogClose containing a Button inside DialogFooter requires as-child.
// Autofix adds the missing attribute without replacing existing bindings.
// -----------------------------------------------------------------------------

const dialogFooterCloseAsChild = {
  meta: {
    type: 'problem',
    docs: { description: 'require as-child on DialogFooter close controls containing Button' },
    fixable: 'code',
    schema: [],
    messages: { missing: '<DialogClose> containing <Button> inside <DialogFooter> requires as-child.' },
  },

  create(context) {
    const parserServices = context.sourceCode.parserServices;
    if (!parserServices.defineTemplateBodyVisitor) return {};

    const insideFooter = (node) => {
      let parent = node.parent;
      while (parent?.type === 'VElement') {
        if (['DialogFooter', 'dialog-footer'].includes(parent.rawName)) return true;
        if (['Dialog', 'AlertDialog', 'alert-dialog'].includes(parent.rawName)) return false;
        parent = parent.parent;
      }
      return false;
    };

    const containsButton = (node) => node.children.some((child) => {
      if (child.type !== 'VElement') return false;
      if (child.rawName === 'Button') return true;
      if (['DialogClose', 'dialog-close', 'Dialog', 'AlertDialog', 'alert-dialog'].includes(child.rawName)) return false;
      return containsButton(child);
    });

    return parserServices.defineTemplateBodyVisitor({
      VElement(node) {
        if (!['DialogClose', 'dialog-close'].includes(node.rawName)
          || !insideFooter(node) || !containsButton(node)) return;

        const hasAsChild = node.startTag.attributes.some((attribute) => {
          if (!attribute.directive) return ['as-child', 'aschild'].includes(attribute.key.name.toLowerCase());
          return attribute.key.name.name === 'bind'
            && attribute.key.argument?.type === 'VIdentifier'
            && ['as-child', 'aschild'].includes(attribute.key.argument.name.toLowerCase());
        });

        if (!hasAsChild) {
          context.report({
            loc: node.startTag.loc,
            messageId: 'missing',
            fix: (fixer) => fixer.insertTextAfterRange(
              [node.startTag.range[0], node.startTag.range[0] + node.rawName.length + 1],
              ' as-child',
            ),
          });
        }
      },
    });
  },
};

const dialogsAtTemplateRoot = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'require Dialog and AlertDialog to be direct children of the root template',
    },
    schema: [],
    messages: {
      nested: '<{{ component }}> must be a direct child of the root <template>.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const templateBody = sourceCode.ast.templateBody;
    const parserServices = sourceCode.parserServices;

    if (!templateBody || !parserServices.defineTemplateBodyVisitor) {
      return {};
    }

    // Moving components can change scope, conditionals, and layout: report only.
    return parserServices.defineTemplateBodyVisitor({
      VElement(node) {
        if (isDialogComponent(node) && node.parent !== templateBody) {
          context.report({
            loc: node.startTag.loc,
            messageId: 'nested',
            data: { component: node.rawName },
          });
        }
      },
    });
  },
};

const dialogsAtTemplateEnd = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'require Dialog and AlertDialog to form the final group in the root template',
    },
    schema: [],
    messages: {
      afterDialogs: 'Only Dialog and AlertDialog components may follow the first root-level dialog. Move other content before the dialog group.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const templateBody = sourceCode.ast.templateBody;
    const parserServices = sourceCode.parserServices;

    if (!templateBody || !parserServices.defineTemplateBodyVisitor) {
      return {};
    }

    return parserServices.defineTemplateBodyVisitor({
      VElement(node) {
        if (node !== templateBody) {
          return;
        }

        let hasDialog = false;

        for (const child of templateBody.children) {
          if (isDialogComponent(child)) {
            hasDialog = true;
            continue;
          }

          // Comments and whitespace may separate or follow dialogs.
          if (!hasDialog || child.type === 'VHTMLComment'
            || (child.type === 'VText' && !child.value.trim())) {
            continue;
          }

          context.report({
            loc: child.startTag?.loc ?? child.loc,
            messageId: 'afterDialogs',
          });
        }
      },
    });
  },
};

const scriptExpressionWrappers = new Set([
  'TSAsExpression',
  'TSTypeAssertion',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSInstantiationExpression',
  'ChainExpression',
]);

const unwrapScriptExpression = (node) => {
  while (node && scriptExpressionWrappers.has(node.type)) {
    node = node.expression;
  }

  return node;
};

const isDefinePropsExpression = (expression) => {
  const node = unwrapScriptExpression(expression);

  if (node?.type !== 'CallExpression' || node.callee.type !== 'Identifier') {
    return false;
  }

  return node.callee.name === 'defineProps'
    || (node.callee.name === 'withDefaults' && isDefinePropsExpression(node.arguments[0]));
};

const isPropsDeclarator = (node) => node?.type === 'VariableDeclarator'
  && node.id.type === 'Identifier'
  && node.id.name === 'props'
  && isDefinePropsExpression(node.init);

const scriptDeclarationOrder = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'require imports, types, and defineProps before other script statements',
    },
    schema: [],
    messages: {
      order: '{{ section }} must appear before {{ previous }}. Expected order: imports, types/interfaces, defineProps, then other statements.',
    },
  },

  create(context) {
    const documentFragment = context.sourceCode.parserServices.getDocumentFragment?.();

    if (!documentFragment) {
      return {};
    }

    const scripts = documentFragment.children.filter(
      (node) => node.type === 'VElement' && node.rawName === 'script',
    );
    const sections = ['Imports', 'Types/interfaces', 'defineProps', 'Other statements'];
    const getSection = (statement) => {
      const node = statement.type === 'ExportNamedDeclaration' && statement.declaration
        ? statement.declaration
        : statement;

      if (['ImportDeclaration', 'TSImportEqualsDeclaration'].includes(node.type)) {
        return 0;
      }

      if (['TSTypeAliasDeclaration', 'TSInterfaceDeclaration'].includes(node.type)
        || (node.type === 'ExportNamedDeclaration' && node.exportKind === 'type')) {
        return 1;
      }

      if ((node.type === 'ExpressionStatement' && isDefinePropsExpression(node.expression))
        || (node.type === 'VariableDeclaration' && node.declarations.some(
          (declaration) => isDefinePropsExpression(declaration.init),
        ))) {
        return 2;
      }

      return 3;
    };

    // Report only: reordering executable declarations may change behavior.
    return {
      Program(program) {
        // A normal <script> and <script setup> each have their own ordering.
        for (const script of scripts) {
          let highestSection = 0;

          for (const statement of program.body) {
            if (statement.type === 'EmptyStatement'
              || statement.range[0] < script.startTag.range[1]
              || statement.range[1] > (script.endTag?.range[0] ?? script.range[1])) {
              continue;
            }

            const section = getSection(statement);

            if (section < highestSection) {
              context.report({
                node: statement,
                messageId: 'order',
                data: {
                  section: sections[section],
                  previous: sections[highestSection].toLowerCase(),
                },
              });
            }

            highestSection = Math.max(highestSection, section);
          }
        }
      },
    };
  },
};

const definePropsAssignment = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'require defineProps to be assigned to a const named props',
    },
    schema: [],
    messages: {
      assignment: 'Assign defineProps to a const named props. Destructuring, other names, and loose calls are not allowed.',
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'defineProps') {
          return;
        }

        let expression = node;

        while (expression.parent) {
          const parent = expression.parent;

          if ((scriptExpressionWrappers.has(parent.type) && parent.expression === expression)
            || (parent.type === 'CallExpression' && parent.callee.type === 'Identifier'
              && parent.callee.name === 'withDefaults' && parent.arguments[0] === expression)) {
            expression = parent;
            continue;
          }

          break;
        }

        const declaration = expression.parent;

        if (!isPropsDeclarator(declaration) || declaration.parent.kind !== 'const'
          || declaration.init !== expression) {
          // Renaming or introducing a binding requires reviewing its usages.
          context.report({ node, messageId: 'assignment' });
        }
      },
    };
  },
};

const scriptRegions = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'require script code inside regions with 140-character opening banners',
    },
    fixable: 'code',
    schema: [],
    messages: {
      outside: 'Place this code inside a named region. Only imports and const props = defineProps(...) may be outside regions.',
      format: 'Use a standalone // region --- Title --- banner with trailing dashes. Malformed banners must be corrected manually.',
      length: 'Region banner must contain exactly 140 characters, including indentation; found {{ length }}.',
      endFormat: 'Use a standalone // endregion comment.',
      unmatchedEnd: 'This endregion has no matching region in this script block.',
      unclosed: 'Close this region with // endregion in the same script block.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const documentFragment = sourceCode.parserServices.getDocumentFragment?.();

    if (!documentFragment) {
      return {};
    }

    return {
      Program(program) {
        const comments = sourceCode.getAllComments();
        const scripts = documentFragment.children.filter(
          (node) => node.type === 'VElement' && node.rawName === 'script',
        );

        for (const script of scripts) {
          const start = script.startTag.range[1];
          const end = script.endTag?.range[0] ?? script.range[1];
          const stack = [];
          const regions = [];

          for (const comment of comments) {
            if (comment.type !== 'Line' || comment.range[0] < start || comment.range[1] > end) {
              continue;
            }

            const text = sourceCode.getText(comment);
            const line = sourceCode.lines[comment.loc.start.line - 1];

            if (/^\/\/\s*region\b/.test(text)) {
              // Recognize a malformed marker but never guess its title or repair its prefix.
              stack.push(comment);

              if (!/^[\t ]*\/\/ region --- (\S(?:.*\S)?) (-+)$/.test(line)) {
                context.report({ loc: comment.loc, messageId: 'format' });
                continue;
              }

              const length = Array.from(line).length;

              if (length !== 140) {
                context.report({
                  loc: comment.loc,
                  messageId: 'length',
                  data: { length },
                  // Only pad a valid, short banner at its right edge.
                  fix: length < 140
                    ? (fixer) => fixer.insertTextAfterRange(comment.range, '-'.repeat(140 - length))
                    : undefined,
                });
              }

              continue;
            }

            if (/^\/\/\s*endregion\b/.test(text)) {
              if (!/^[\t ]*\/\/ endregion$/.test(line)) {
                context.report({ loc: comment.loc, messageId: 'endFormat' });
              }

              const opening = stack.pop();

              if (opening) {
                regions.push([opening.range[1], comment.range[0]]);
              } else {
                context.report({ loc: comment.loc, messageId: 'unmatchedEnd' });
              }
            }
          }

          for (const opening of stack) {
            context.report({ loc: opening.loc, messageId: 'unclosed' });
          }

          for (const statement of program.body) {
            if (statement.range[0] < start || statement.range[1] > end
              || ['ImportDeclaration', 'TSImportEqualsDeclaration'].includes(statement.type)
              || (statement.type === 'VariableDeclaration' && statement.kind === 'const'
                && statement.declarations.every(isPropsDeclarator))) {
              continue;
            }

            // Requiring the complete declaration also covers its nested code.
            const enclosed = regions.some(([regionStart, regionEnd]) => (
              regionStart <= statement.range[0] && regionEnd >= statement.range[1]
            ));

            if (!enclosed) {
              context.report({ node: statement, messageId: 'outside' });
            }
          }
        }
      },
    };
  },
};

const noHardcodedInertiaUrls = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'disallow hardcoded URLs in Inertia requests, Link hrefs, and anchor hrefs',
    },
    schema: [],
    messages: {
      request: 'Use a routing helper instead of a hardcoded URL in this Inertia request.',
      href: 'Use a routing helper instead of a hardcoded href on <{{ component }}>.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const linkNames = new Set(['Link', 'a']);
    const inertiaPackages = new Set(['@inertiajs/vue3', '@inertiajs/core', '@inertiajs/react', '@inertiajs/svelte']);
    const requestMethods = new Set([
      'get', 'post', 'put', 'patch', 'delete', 'head', 'options',
      'visit', 'submit', 'prefetch', 'push', 'replace',
    ]);
    const propertyName = (node) => !node.computed && node.property.type === 'Identifier'
      ? node.property.name
      : node.property.type === 'Literal' ? node.property.value : undefined;
    const findVariable = (node) => {
      let scope = sourceCode.getScope(node);

      while (scope) {
        const variable = scope.set.get(node.name);

        if (variable) {
          return variable;
        }

        scope = scope.upper;
      }

      return undefined;
    };
    const imported = (expression) => {
      const node = unwrapScriptExpression(expression);

      if (node?.type === 'Identifier') {
        const definition = findVariable(node)?.defs.find((entry) => entry.type === 'ImportBinding');

        if (definition) {
          return {
            source: definition.parent.source.value,
            name: definition.node.type === 'ImportNamespaceSpecifier'
              ? '*'
              : definition.node.imported?.name ?? definition.node.imported?.value ?? 'default',
          };
        }
      }

      if (node?.type === 'MemberExpression') {
        const namespace = imported(node.object);

        if (namespace?.name === '*') {
          return { source: namespace.source, name: propertyName(node) };
        }
      }

      return undefined;
    };
    const isFormFactory = (expression) => {
      const binding = imported(expression);

      return binding && ((binding.name === 'useForm' && inertiaPackages.has(binding.source))
        || (binding.name === 'useInertiaPlusForm' && binding.source === 'escore-packages/inertia-plus'));
    };
    const isFormMethodThis = (node) => {
      let parent = node.parent;

      while (parent) {
        // Arrow callbacks retain the surrounding method's this; ordinary functions do not.
        if (['FunctionExpression', 'FunctionDeclaration'].includes(parent.type)) {
          const property = parent.parent;
          const definition = property?.type === 'Property' ? property.parent : undefined;
          const call = definition?.parent;

          return definition?.type === 'ObjectExpression' && call?.type === 'CallExpression'
            && call.arguments.includes(definition) && isFormFactory(call.callee);
        }

        parent = parent.parent;
      }

      return false;
    };
    const isInertiaReceiver = (expression, seen = new Set()) => {
      const node = unwrapScriptExpression(expression);

      if (!node) {
        return false;
      }

      const binding = imported(node);

      if (binding?.name === 'router' && inertiaPackages.has(binding.source)) {
        return true;
      }

      if (node.type === 'ThisExpression') {
        return isFormMethodThis(node);
      }

      if (node.type === 'MemberExpression' && node.object.type === 'ThisExpression'
        && propertyName(node) === '$inertia') {
        return true;
      }

      if (node.type === 'CallExpression') {
        return isFormFactory(node.callee);
      }

      if (node.type === 'Identifier') {
        const variable = findVariable(node);

        if (node.name === '$inertia' && !variable?.defs.length) {
          return true;
        }

        if (variable && !seen.has(variable)) {
          seen.add(variable);
          const definition = variable.defs.find((entry) => entry.type === 'Variable'
            && entry.parent.kind === 'const');

          return definition ? isInertiaReceiver(definition.node.init, seen) : false;
        }
      }

      return false;
    };
    const hasHardcodedUrl = (expression) => {
      const node = unwrapScriptExpression(expression);

      if (!node) {
        return false;
      }

      if (node.type === 'Literal') {
        return typeof node.value === 'string';
      }

      if (node.type === 'TemplateLiteral') {
        return node.quasis.some((part) => part.value.raw.length > 0)
          || node.expressions.some(hasHardcodedUrl);
      }

      if (node.type === 'BinaryExpression' && node.operator === '+') {
        return hasHardcodedUrl(node.left) || hasHardcodedUrl(node.right);
      }

      if (node.type === 'ConditionalExpression') {
        return hasHardcodedUrl(node.consequent) || hasHardcodedUrl(node.alternate);
      }

      if (node.type === 'LogicalExpression') {
        return hasHardcodedUrl(node.left) || hasHardcodedUrl(node.right);
      }

      if (node.type === 'ObjectExpression') {
        return node.properties.some((property) => property.type === 'Property'
          && ((!property.computed && property.key.name === 'url') || property.key.value === 'url')
          && hasHardcodedUrl(property.value));
      }

      return false;
    };
    const scriptVisitor = {
      ImportDeclaration(node) {
        if (inertiaPackages.has(node.source.value)) {
          for (const specifier of node.specifiers) {
            if (specifier.type === 'ImportSpecifier' && specifier.imported.name === 'Link') {
              linkNames.add(specifier.local.name);
            }
          }
        }
      },
      CallExpression(node) {
        const callee = unwrapScriptExpression(node.callee);

        if (callee?.type !== 'MemberExpression' || !requestMethods.has(propertyName(callee))
          || !isInertiaReceiver(callee.object)) {
          return;
        }

        // submit(method, url, options) and submit({ method, url }, options).
        const first = unwrapScriptExpression(node.arguments[0]);
        const url = propertyName(callee) === 'submit' && first?.type !== 'ObjectExpression'
          ? node.arguments[1]
          : node.arguments[0];

        if (hasHardcodedUrl(url)) {
          context.report({ node: url, messageId: 'request' });
        }
      },
    };
    const templateVisitor = {
      VAttribute(node) {
        const component = node.parent.parent.rawName;

        if (!linkNames.has(component)) {
          return;
        }

        const isStaticHref = !node.directive && node.key.name === 'href' && node.value;
        const argument = node.directive ? node.key.argument : undefined;
        const isBoundHref = node.directive && node.key.name.name === 'bind'
          && ((argument?.type === 'VIdentifier' && argument.name === 'href')
            || (argument?.type === 'VExpressionContainer' && argument.expression?.value === 'href'));

        if (isStaticHref || (isBoundHref && hasHardcodedUrl(node.value?.expression))) {
          context.report({ node, messageId: 'href', data: { component } });
        }
      },
    };

    return sourceCode.parserServices.defineTemplateBodyVisitor
      ? sourceCode.parserServices.defineTemplateBodyVisitor(templateVisitor, scriptVisitor)
      : scriptVisitor;
  },
};

const fieldLabelInputAssociation = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'require FieldLabel for and FieldContent input id attributes with matching values',
    },
    schema: [],
    messages: {
      missingFor: '<FieldLabel> requires an explicit, nonempty for or :for attribute.',
      missingDataInvalid: '<Field> requires an explicit :data-invalid binding.',
      missingErrors: '<FieldError> requires an explicit :errors binding.',
      missingId: 'An input inside <FieldContent> requires an explicit, nonempty id or :id attribute.',
      missingAriaInvalid: 'An input inside <FieldContent> requires an explicit :aria-invalid binding.',
      mismatch: 'FieldLabel for and input id must match within this Field. Use the same expression for dynamic bindings.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const parserServices = sourceCode.parserServices;
    const tokenStore = parserServices.getTemplateBodyTokenStore?.();

    if (!parserServices.defineTemplateBodyVisitor || !tokenStore) {
      return {};
    }

    const isField = (node) => node.type === 'VElement' && ['Field', 'field'].includes(node.rawName);
    const isLabel = (node) => ['FieldLabel', 'field-label'].includes(node.rawName);
    const isContent = (node) => ['FieldContent', 'field-content'].includes(node.rawName);
    const isInput = (node) => ['Input', 'input'].includes(node.rawName);
    const insideContent = (node) => {
      let parent = node.parent;

      while (parent?.type === 'VElement') {
        // A nested Field owns its own controls.
        if (isField(parent)) {
          return false;
        }

        if (isContent(parent)) {
          return true;
        }

        parent = parent.parent;
      }

      return false;
    };
    const attributeValue = (node, name) => {
      for (const attribute of node.startTag.attributes) {
        if (!attribute.directive && attribute.key.name === name) {
          const value = attribute.value?.value;

          return value?.trim() ? { attribute, key: `literal:${value}` } : undefined;
        }

        if (!attribute.directive || attribute.key.name.name !== 'bind'
          || attribute.key.argument?.type !== 'VIdentifier' || attribute.key.argument.name !== name) {
          continue;
        }

        // Vue's :id / :for shorthand binds the identifier of the same name.
        if (!attribute.value) {
          return { attribute, key: `expression:${JSON.stringify([['Identifier', name]])}` };
        }

        const expression = unwrapScriptExpression(attribute.value.expression);

        if (!expression) {
          return undefined;
        }

        if (expression.type === 'Literal' && ['string', 'number'].includes(typeof expression.value)) {
          const value = String(expression.value);

          return value.trim() ? { attribute, key: `literal:${value}` } : undefined;
        }

        if (expression.type === 'Literal' && expression.value == null) {
          return undefined;
        }

        if (expression.type === 'TemplateLiteral' && expression.expressions.length === 0) {
          const value = expression.quasis[0].value.cooked;

          return value?.trim() ? { attribute, key: `literal:${value}` } : undefined;
        }

        // Compare tokens, ignoring formatting while preserving spaces inside strings.
        const tokens = tokenStore.getTokens(expression).map((token) => [token.type, token.value]);

        return { attribute, key: `expression:${JSON.stringify(tokens)}` };
      }

      return undefined;
    };

    return parserServices.defineTemplateBodyVisitor({
      VElement(node) {
        if (isLabel(node) && !attributeValue(node, 'for')) {
          context.report({ loc: node.startTag.loc, messageId: 'missingFor' });
        }

        if (['FieldError', 'field-error'].includes(node.rawName)) {
          const hasErrors = node.startTag.attributes.some((attribute) => attribute.directive
            && attribute.key.name.name === 'bind'
            && attribute.key.argument?.type === 'VIdentifier'
            && attribute.key.argument.name === 'errors');

          if (!hasErrors) {
            context.report({ loc: node.startTag.loc, messageId: 'missingErrors' });
          }
        }

        if (isInput(node) && insideContent(node)) {
          if (!attributeValue(node, 'id')) {
            context.report({ loc: node.startTag.loc, messageId: 'missingId' });
          }

          const hasAriaInvalid = node.startTag.attributes.some((attribute) => attribute.directive
            && attribute.key.name.name === 'bind'
            && attribute.key.argument?.type === 'VIdentifier'
            && attribute.key.argument.name === 'aria-invalid');

          if (!hasAriaInvalid) {
            context.report({ loc: node.startTag.loc, messageId: 'missingAriaInvalid' });
          }
        }

        if (!isField(node)) {
          return;
        }

        const hasDataInvalid = node.startTag.attributes.some((attribute) => attribute.directive
          && attribute.key.name.name === 'bind'
          && attribute.key.argument?.type === 'VIdentifier'
          && attribute.key.argument.name === 'data-invalid');

        if (!hasDataInvalid) {
          context.report({ loc: node.startTag.loc, messageId: 'missingDataInvalid' });
        }

        const labels = [];
        const inputs = [];
        const collect = (element) => {
          for (const child of element.children) {
            if (child.type !== 'VElement' || isField(child)) {
              continue;
            }

            if (isLabel(child)) {
              labels.push(child);
            }

            if (isInput(child) && insideContent(child)) {
              inputs.push(child);
            }

            collect(child);
          }
        };

        collect(node);

        // Multiple controls require explicit pairing; do not guess associations.
        if (labels.length !== 1 || inputs.length !== 1) {
          return;
        }

        const labelFor = attributeValue(labels[0], 'for');
        const inputId = attributeValue(inputs[0], 'id');

        if (labelFor && inputId && labelFor.key !== inputId.key) {
          // Changing an ID may break other labels, selectors, or accessibility references.
          context.report({ node: labelFor.attribute, messageId: 'mismatch' });
        }
      },
    });
  },
};

// -----------------------------------------------------------------------------
// Rule: field-input-content
// Inputs belong inside their nearest Field's FieldContent.
// No autofix: adding a wrapper can change layout.
// -----------------------------------------------------------------------------

const fieldInputContent = {
  meta: {
    type: 'problem',
    docs: { description: 'require inputs inside Field to be wrapped in FieldContent' },
    schema: [],
    messages: { missing: 'An input inside <Field> must be inside that field\'s <FieldContent>.' },
  },

  create(context) {
    const parserServices = context.sourceCode.parserServices;
    if (!parserServices.defineTemplateBodyVisitor) return {};

    return parserServices.defineTemplateBodyVisitor({
      VElement(node) {
        if (!['Input', 'input'].includes(node.rawName)) return;

        let parent = node.parent;
        let hasContent = false;

        while (parent?.type === 'VElement') {
          // Stop at the owning Field; an outer FieldContent cannot satisfy it.
          if (['Field', 'field'].includes(parent.rawName)) {
            if (!hasContent) {
              context.report({ loc: node.startTag.loc, messageId: 'missing' });
            }
            return;
          }

          if (['FieldContent', 'field-content'].includes(parent.rawName)) {
            hasContent = true;
          }

          parent = parent.parent;
        }
      },
    });
  },
};

const createRequireAttributeRule = (components, attributeName) => ({
  meta: {
    type: 'suggestion',
    docs: {
      description: `require an explicit ${attributeName} on ${components.join(' and ')} elements`,
    },
    schema: [],
    messages: {
      missing: `<{{ component }}> requires an explicit, nonempty ${attributeName} or :${attributeName} attribute.`,
    },
  },

  create(context) {
    const parserServices = context.sourceCode.parserServices;

    if (!parserServices.defineTemplateBodyVisitor) {
      return {};
    }

    return parserServices.defineTemplateBodyVisitor({
      VElement(node) {
        if (!components.includes(node.rawName)) {
          return;
        }

        const hasAttribute = node.startTag.attributes.some((attribute) => {
          if (!attribute.directive) {
            return attribute.key.name === attributeName && Boolean(attribute.value?.value.trim());
          }

          const expression = unwrapScriptExpression(attribute.value?.expression);
          const isEmptyLiteral = expression?.type === 'Literal'
            && (expression.value == null || (typeof expression.value === 'string' && !expression.value.trim()));
          const isEmptyTemplate = expression?.type === 'TemplateLiteral'
            && expression.expressions.length === 0 && !expression.quasis[0].value.cooked?.trim();

          return attribute.key.name.name === 'bind'
            && attribute.key.argument?.type === 'VIdentifier'
            && attribute.key.argument.name === attributeName
            && (!attribute.value || (Boolean(expression) && !isEmptyLiteral && !isEmptyTemplate));
        });

        if (!hasAttribute) {
          // Require an explicit choice without guessing the intended value.
          context.report({
            loc: node.startTag.loc,
            messageId: 'missing',
            data: { component: node.rawName },
          });
        }
      },
    });
  },
});

const requireButtonType = createRequireAttributeRule(['Button', 'button'], 'type');
const requireInputType = createRequireAttributeRule(['Input', 'input'], 'type');

// -----------------------------------------------------------------------------
// Rule: require-button-variant
// Require a nonempty variant on the Button component, excluding native buttons.
// -----------------------------------------------------------------------------

const requireButtonVariant = createRequireAttributeRule(['Button'], 'variant');

// -----------------------------------------------------------------------------
// Rule: require-button-size
// Require a nonempty size on the Button component, excluding native buttons.
// -----------------------------------------------------------------------------

const requireButtonSize = createRequireAttributeRule(['Button'], 'size');

const contextMenuItemIcon = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'require a leading imported icon in every ContextMenuItem',
    },
    schema: [{
      type: 'object',
      properties: {
        sources: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          minItems: 1,
          uniqueItems: true,
        },
      },
      additionalProperties: false,
    }],
    messages: {
      missing: '<ContextMenuItem> must start with a direct-child icon imported from a configured icon package.',
      ariaHidden: 'The ContextMenuItem icon requires aria-hidden="true".',
    },
  },

  create(context) {
    const parserServices = context.sourceCode.parserServices;

    if (!parserServices.defineTemplateBodyVisitor) {
      return {};
    }

    const sources = new Set(context.options[0]?.sources ?? ['@lucide/vue', 'lucide-vue-next']);
    const icons = new Set();
    const namespaces = new Set();
    const kebabCase = (name) => name
      .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase();
    const isImportedIcon = (node) => {
      if (node?.type !== 'VElement') {
        return false;
      }

      if (icons.has(node.rawName)) {
        return true;
      }

      const parts = node.rawName.split('.');

      return parts.length === 2 && namespaces.has(parts[0]);
    };

    return parserServices.defineTemplateBodyVisitor({
      VElement(node) {
        if (!['ContextMenuItem', 'context-menu-item'].includes(node.rawName)) {
          return;
        }

        // Ignore whitespace/comments, but do not permit visible text before the icon.
        const icon = node.children.find((child) => child.type !== 'VHTMLComment'
          && !(child.type === 'VText' && !child.value.trim()));

        if (!isImportedIcon(icon)) {
          context.report({ loc: node.startTag.loc, messageId: 'missing' });
          return;
        }

        const isHidden = icon.startTag.attributes.some((attribute) => {
          if (!attribute.directive) {
            return attribute.key.name === 'aria-hidden' && attribute.value?.value === 'true';
          }

          if (attribute.key.name.name !== 'bind' || attribute.key.argument?.type !== 'VIdentifier'
            || attribute.key.argument.name !== 'aria-hidden') {
            return false;
          }

          const expression = unwrapScriptExpression(attribute.value?.expression);

          return expression?.type === 'Literal' && [true, 'true'].includes(expression.value);
        });

        if (!isHidden) {
          context.report({ loc: icon.startTag.loc, messageId: 'ariaHidden' });
        }
      },
    }, {
      ImportDeclaration(node) {
        if (!sources.has(node.source.value) || node.importKind === 'type') {
          return;
        }

        for (const specifier of node.specifiers) {
          if (specifier.importKind === 'type') {
            continue;
          }

          if (specifier.type === 'ImportNamespaceSpecifier') {
            namespaces.add(specifier.local.name);
          } else {
            // Track the local binding, including renamed imports such as Eye as ViewIcon.
            icons.add(specifier.local.name);
            icons.add(kebabCase(specifier.local.name));
          }
        }
      },
    });
  },
};

const escore = {
  rules: {
    ...inertiaPlusRules,
    'require-comment-before-component': requireCommentBeforeComponent,
    'table-cell-comment-consistency': tableCellCommentConsistency,
    'table-body-second-row-comment': tableBodySecondRowComment,
    'table-cell-content-newline': tableCellContentNewline,
    'table-head-content-newline': tableHeadContentNewline,
    'template-comment-padding': templateCommentPadding,
    'vue-no-multiple-empty-lines': vueNoMultipleEmptyLines,
    'dialog-section-padding': dialogSectionPadding,
    'dialog-description-layout': dialogDescriptionLayout,
    'empty-description-layout': emptyDescriptionLayout,
    'dialog-open-requires-processing': dialogOpenRequiresProcessing,
    'dialog-open-requires-dismissible': dialogOpenRequiresDismissible,
    'dialog-open-requires-update-open': dialogOpenRequiresUpdateOpen,
    'dialog-footer-close-as-child': dialogFooterCloseAsChild,
    'dialogs-at-template-root': dialogsAtTemplateRoot,
    'dialogs-at-template-end': dialogsAtTemplateEnd,
    'script-declaration-order': scriptDeclarationOrder,
    'define-props-assignment': definePropsAssignment,
    'script-regions': scriptRegions,
    'no-hardcoded-inertia-urls': noHardcodedInertiaUrls,
    'field-label-input-association': fieldLabelInputAssociation,
    'field-input-content': fieldInputContent,
    'require-button-type': requireButtonType,
    'require-button-variant': requireButtonVariant,
    'require-button-size': requireButtonSize,
    'require-input-type': requireInputType,
    'context-menu-item-icon': contextMenuItemIcon,
  },
};

const projectDirectory = process.cwd();

const projectRequire = createRequire(join(projectDirectory, 'package.json'));

async function importProjectPackage(packageName) {
    let resolvedPath;

    try {
        resolvedPath = projectRequire.resolve(packageName);
    } catch (cause) {
        throw new Error(
            `Shared ESLint config could not resolve ${packageName} from target project ${projectDirectory}.`,
            { cause }
        );
    }

    try {
        return await import(pathToFileURL(resolvedPath).href);
    } catch (cause) {
        throw new Error(
            `Shared ESLint config could not load ${packageName} from target project ${projectDirectory}.`,
            { cause }
        );
    }
}

function unwrapDefault(module) {
    return module.default ?? module;
}

const stylistic = unwrapDefault(
    await importProjectPackage('@stylistic/eslint-plugin')
);
const vueTsModule = await importProjectPackage('@vue/eslint-config-typescript');
const vueTs = unwrapDefault(vueTsModule);
const defineConfigWithVueTs = vueTsModule.defineConfigWithVueTs ?? vueTs.defineConfigWithVueTs;
const vueTsConfigs = vueTsModule.vueTsConfigs ?? vueTs.vueTsConfigs;
const importModule = await importProjectPackage('eslint-plugin-import-x');
const importPlugin = unwrapDefault(importModule);
const { createTypeScriptImportResolver } = await importProjectPackage('eslint-import-resolver-typescript');
const vue = unwrapDefault(await importProjectPackage('eslint-plugin-vue'));

const controlStatements = [
    'if',
    'return',
    'for',
    'while',
    'do',
    'switch',
    'try',
    'throw'
];
const paddingAroundControl = [
    ...controlStatements.flatMap((stmt) => [
        { blankLine: 'always', prev: '*', next: stmt },
        { blankLine: 'always', prev: stmt, next: '*' }
    ])
];

export default defineConfigWithVueTs(
    vue.configs['flat/essential'],
    vueTsConfigs.recommended,
    {
        plugins: {
            'import-x': importPlugin,
            escore
        },
        settings: {
            'import-x/resolver-next': [
                createTypeScriptImportResolver({
                    alwaysTryTypes: true,
                    project: join(projectDirectory, 'tsconfig.json')
                }),
                importModule.createNodeResolver()
            ]
        },
        rules: {
            'escore/no-hardcoded-inertia-urls': 'error',
            'escore/inertia-plus-form-options': 'error',
            'escore/inertia-plus-const': 'error',
            'escore/inertia-plus-form-name': 'error',
            'escore/inertia-plus-single-line-opening': 'error',
            'escore/inertia-plus-form-definition': 'error',
            'escore/inertia-plus-form-submit': 'error',
            'escore/inertia-plus-form-methods': 'error',
            'escore/inertia-plus-form-method-context': 'error',
            'escore/inertia-plus-before-submit-call': 'error',
            'escore/inertia-plus-submit-processing-guard': 'error',
            'escore/inertia-plus-surface-openable': 'error',
            'vue/multi-word-component-names': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true }],
            '@typescript-eslint/consistent-type-imports': [
                'error',
                {
                    prefer: 'type-imports',
                    fixStyle: 'separate-type-imports'
                }
            ],
            'import-x/order': [
                'error',
                {
                    groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index']
                    // alphabetize: { order: 'asc', caseInsensitive: true },
                }
            ],
            'import-x/consistent-type-specifier-style': [
                'error',
                'prefer-top-level'
            ]
        }
    },
    {
        files: ['**/*.vue'],
        plugins: {
            escore
        },
        rules: {
            // Extend component coverage here; keep component-specific inference in the rule.
            'escore/require-comment-before-component': [
                'error',
                {
                    components: {
                        Alert: { autofix: 'missing-only', matchesDescendantText: 'AlertTitle' },
                        TabsContent: { notWithin: 'Transition' },
                        Badge: { autofix: 'missing-only', matchesLiteralText: true, notWithin: 'TableCell' },
                        Button: {
                            autofix: 'missing-only',
                            matchesLiteralText: true,
                            notWithin: ['ComboboxTrigger', 'ContextMenuTrigger', 'DialogClose', 'DropdownMenuTrigger', 'PopoverTrigger', 'nav', 'TableCell', 'CreatePortfolioDialog']
                        },
                        Card: { autofix: 'missing-only', matchesDescendantText: 'CardTitle', notWithin: ['Tabs', 'TabsContent', 'PageSectionContent'] },
                        Combobox: {
                            autofix: 'missing-only',
                            sourceComponent: 'ComboboxTrigger',
                            sourceTraversal: 'native-only',
                            notWithin: ['Field']
                        },
                        ContextMenuItem: { autofix: 'missing-only', matchesLiteralText: true },
                        ContextMenuLabel: { autofix: 'replace', equals: 'Label' },
                        ContextMenuSeparator: { autofix: 'replace', equals: 'Separator' },
                        Dialog: {
                            autofix: 'missing-only',
                            sourceComponent: 'DialogTitle',
                            sourceTextTransform: 'title-case',
                            sourceTraversal: 'native-only',
                            suffix: 'Dialog'
                        },
                        DialogClose: { autofix: 'missing-only', matchesLiteralText: true, within: 'DialogFooter' },
                        DropdownMenu: { endsWith: 'Dropdown' },
                        DropdownMenuItem: { autofix: 'missing-only', matchesLiteralText: true },
                        DropdownMenuSeparator: { autofix: 'replace', equals: 'Separator' },
                        Empty: { autofix: 'missing-only', matchesDescendantText: ['EmptyTitle', 'EmptyDescription'], notWithin: 'TableEmpty' },
                        Field: { autofix: 'missing-only', matchesDescendantText: 'FieldLabel', notWithin: ['TableCell'] },
                        FieldSet: { autofix: 'missing-only', matchesDescendantText: 'FieldLegend' },
                        PageSection: {
                            autofix: 'missing-only',
                            sourceComponent: 'PageSectionHeadingTitle',
                            sourceTraversal: 'native-only',
                            suffix: 'Page'
                        },
                        Popover: { autofix: 'missing-only', matchesDescendantText: 'PopoverTrigger' },
                        Separator: { autofix: 'replace', equals: 'Separator' },
                        SidepanelHeader: {
                            autofix: 'missing-only',
                            sourceComponent: 'SidepanelTitle',
                            sourceTraversal: 'native-only'
                        },
                        SidepanelSectionHeader: {
                            autofix: 'missing-only',
                            sourceComponent: 'SidepanelSectionTitle',
                            sourceTraversal: 'native-only'
                        },
                        StatCard: { autofix: 'missing-only', matchesDescendantText: 'StatCardLabel' },
                        TableEmpty: { autofix: 'missing-only', matchesDescendantText: 'EmptyTitle' },
                        TableHead: { autofix: 'replace', matchesLiteralText: true },
                        ToggleGroupItem: {},
                        ButtonGroup: {}
                    }
                }
            ],
            'escore/table-cell-comment-consistency': 'error',
            'escore/table-body-second-row-comment': 'error',
            'escore/table-cell-content-newline': 'error',
            'escore/table-head-content-newline': 'error',
            'escore/template-comment-padding': 'error',
            'escore/vue-no-multiple-empty-lines': 'error',
            'escore/dialog-section-padding': 'error',
            'escore/dialog-description-layout': 'error',
            'escore/empty-description-layout': 'error',
            'escore/dialog-open-requires-processing': 'error',
            'escore/dialog-open-requires-dismissible': 'error',
            'escore/dialog-open-requires-update-open': 'error',
            'escore/dialog-footer-close-as-child': 'error',
            'escore/dialogs-at-template-root': 'error',
            'escore/dialogs-at-template-end': 'error',
            'escore/script-declaration-order': 'error',
            'escore/define-props-assignment': 'error',
            'escore/script-regions': 'warn',
            'escore/field-label-input-association': 'error',
            'escore/field-input-content': 'error',
            'escore/require-button-type': 'error',
            'escore/require-button-variant': 'error',
            'escore/require-button-size': 'error',
            'escore/require-input-type': 'error',
            'escore/context-menu-item-icon': ['error', { sources: ['@lucide/vue', 'lucide-vue-next'] }]
        }
    },
    {
        plugins: {
            '@stylistic': stylistic
        },
        rules: {
            '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: false }],
            '@stylistic/padding-line-between-statements': [
                'error',
                ...paddingAroundControl,
                { blankLine: 'any', prev: 'if', next: 'if' }
            ]
        }
    },
    {
        ignores: [
            'vendor',
            'node_modules',
            'public',
            'bootstrap/ssr',
            'tailwind.config.js',
            'vite.config.ts',
            'resources/js/actions/**',
            'resources/js/components/ui/*',
            'resources/js/routes/**',
            'resources/js/wayfinder/**'
        ]
    },
    {
        plugins: {
            '@stylistic': stylistic
        },
        rules: {
            curly: ['error', 'multi-line'],
            '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: false }]
        }
    }
);
