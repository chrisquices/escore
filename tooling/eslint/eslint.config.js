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

const workspace = {
  rules: {
    'require-comment-before-component': requireCommentBeforeComponent,
    'table-cell-comment-consistency': tableCellCommentConsistency,
    'template-comment-padding': templateCommentPadding,
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
const importPlugin = unwrapDefault(
    await importProjectPackage('eslint-plugin-import')
);
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
            import: importPlugin
        },
        settings: {
            'import/resolver': {
                typescript: {
                    alwaysTryTypes: true,
                    project: './tsconfig.json'
                },
                node: true
            }
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
            'import/order': [
                'error',
                {
                    groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index']
                    // alphabetize: { order: 'asc', caseInsensitive: true },
                }
            ],
            'import/consistent-type-specifier-style': [
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
            'workspace/template-comment-padding': 'error'
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
