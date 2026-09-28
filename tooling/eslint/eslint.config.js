import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

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

const workspace = {
  rules: {
    'require-comment-before-component': requireCommentBeforeComponent,
    'table-cell-comment-consistency': tableCellCommentConsistency,
    'template-comment-padding': templateCommentPadding,
    'dialog-section-padding': dialogSectionPadding,
    'dialogs-at-template-root': dialogsAtTemplateRoot,
    'dialogs-at-template-end': dialogsAtTemplateEnd,
    'script-declaration-order': scriptDeclarationOrder,
    'define-props-assignment': definePropsAssignment,
    'script-regions': scriptRegions,
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
            'import-x': importPlugin
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
            workspace
        },
        rules: {
            // Extend component coverage here; keep component-specific inference in the rule.
            'workspace/require-comment-before-component': [
                'error',
                {
                    components: {
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
                        ButtonGroup: {}
                    }
                }
            ],
            'workspace/table-cell-comment-consistency': 'error',
            'workspace/template-comment-padding': 'error',
            'workspace/dialog-section-padding': 'error',
            'workspace/dialogs-at-template-root': 'error',
            'workspace/dialogs-at-template-end': 'error',
            'workspace/script-declaration-order': 'error',
            'workspace/define-props-assignment': 'error',
            'workspace/script-regions': 'warn'
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
