// Shared comment inference, validation, and autofix implementation.
// Pass elements and their options from a rule wrapper, or omit them to use
// the archived rule's existing ESLint components configuration.

export const insertStandaloneTemplateComment = (fixer, sourceCode, node, text) => {
  const linePrefix = sourceCode.lines[node.loc.start.line - 1].slice(0, node.loc.start.column);
  const indentation = linePrefix.match(/^[\t ]*/)[0];
  const newline = sourceCode.text.includes('\r\n') ? '\r\n' : '\n';

  // Inline markup must stay in place; only leading whitespace can be reused.
  const beforeComment = linePrefix.trim() ? `${newline}${indentation}` : '';

  return fixer.insertTextBefore(node, `${beforeComment}<!-- ${text} -->${newline}${indentation}`);
};

export default ({ elements, ...options } = {}) => ({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'require a standalone comment directly before configured Vue components',
    },
    fixable: 'code',
    schema: elements ? [] : [
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

    // Rule wrappers supply elements and options; the archived configurable rule uses ESLint options.
    const components = elements
      ? Object.fromEntries(elements.map((element) => [element, options]))
      : context.options[0]?.components ?? {};
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
              ? (fixer) => insertStandaloneTemplateComment(fixer, sourceCode, node, autofixText)
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
});
