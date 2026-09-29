// Shared comment inference, validation, and autofix implementation.
// Pass elements and their options from a rule wrapper, or omit them to use
// the archived rule's existing ESLint components configuration.

// Comment bodies do not decode entities. Encode delimiters consistently in both
// inferred expectations and fixes so authored text cannot terminate a comment.
export const safeTemplateCommentText = (text) => text.replace(/--|[<>]/g, (part) => (
  part === '--' ? '&#45;&#45;' : part === '<' ? '&lt;' : '&gt;'
));

export const getStandaloneTemplateComment = (sourceCode, tokenStore, node, { allowEmpty = false } = {}) => {
  let comment = tokenStore.getTokenBefore(node, { includeComments: true });
  while (comment?.type === 'HTMLWhitespace') {
    comment = tokenStore.getTokenBefore(comment, { includeComments: true });
  }

  if (comment?.type !== 'HTMLComment'
    || (!allowEmpty && !comment.value.trim())
    || comment.loc.end.line !== node.loc.start.line - 1
    || sourceCode.lines[comment.loc.start.line - 1].slice(0, comment.loc.start.column).trim()
    || sourceCode.lines[comment.loc.end.line - 1].slice(comment.loc.end.column).trim()) return undefined;

  return comment;
};

export const insertStandaloneTemplateComment = (fixer, sourceCode, node, text) => {
  const linePrefix = sourceCode.lines[node.loc.start.line - 1].slice(0, node.loc.start.column);
  const indentation = linePrefix.match(/^[\t ]*/)[0];
  const newline = sourceCode.text.includes('\r\n') ? '\r\n' : '\n';

  // Inline markup must stay in place; only leading whitespace can be reused.
  const beforeComment = linePrefix.trim() ? `${newline}${indentation}` : '';

  return fixer.insertTextBefore(node, `${beforeComment}<!-- ${safeTemplateCommentText(text)} -->${newline}${indentation}`);
};

const describeRule = (elements, options) => {
  if (!elements) return 'Require nonempty standalone comments immediately above the configured Vue components.';

  const clauses = [`Require a nonempty standalone HTML comment immediately above ${elements.map((name) => `<${name}>`).join(' or ')}.`];
  if (options.equals) clauses.push(`Use exactly "${options.equals}".`);
  if (options.matchesLiteralText) clauses.push('Match its literal text when known.');
  if (options.matchesDescendantText) clauses.push(`Match literal text from ${[options.matchesDescendantText].flat().map((name) => `<${name}>`).join(', falling back to ')}.`);
  if (options.sourceComponent) clauses.push(`Infer text from a unique <${options.sourceComponent}> through native HTML descendants only.`);
  if (options.sourceTextTransform === 'title-case') clauses.push('Capitalize each word in inferred text.');
  if (options.endsWith || options.suffix) clauses.push(`End the comment with "${options.endsWith ?? options.suffix}".`);
  if (options.within) clauses.push(`Apply only inside <${options.within}>.`);
  if (options.notWithin) clauses.push(`Exempt descendants of ${[options.notWithin].flat().map((name) => `<${name}>`).join(', ')}.`);
  return clauses.join(' ');
};

export default ({ elements, ...options } = {}) => ({
  meta: {
    type: 'suggestion',
    docs: {
      description: describeRule(elements, options),
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
      expected: 'Add a nonempty HTML comment on its own line immediately above <{{ component }}>, with no blank line between them. {{ requirement }}',
      expectedExact: 'Replace the comment above <{{ component }}> with <!-- {{ text }} -->. Keep it on its own line immediately above the component.',
      expectedSuffix: 'The comment above <{{ component }}> must end with "{{ suffix }}".',
      expectedDescendantText: 'The comment above <{{ component }}> must match text from <{{ descendant }}>. Expected {{ expected }}; found {{ actual }}. Keep the comment on its own line immediately above the component.',
      expectedSourceText: 'Replace the comment above <{{ component }}> with <!-- {{ text }} -->, derived from <{{ source }}>. Keep it on its own line immediately above the component.',
      expectedText: 'The comment above <{{ component }}> must match its literal text. Expected {{ expected }}; found {{ actual }}. Keep the comment on its own line immediately above the component.',
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
    const hasUncertainText = (element, root) => element.rawName === 'slot'
      || element.startTag.attributes.some((attribute) => attribute.directive
        && (['text', 'html'].includes(attribute.key.name.name)
          || (element !== root && ['if', 'else-if', 'else', 'for', 'show'].includes(attribute.key.name.name))));
    const getLiteralTexts = (element) => {
      const fragments = [];
      let hasDynamicText = false;
      const collectLiteralTexts = (currentElement) => {
        if (hasUncertainText(currentElement, element)) {
          hasDynamicText = true;
          return;
        }

        for (const child of currentElement.children) {
          if (child.type === 'VText') {
            fragments.push(child.value);
          } else if (child.type === 'VExpressionContainer') {
            hasDynamicText = true;
          } else if (child.type === 'VElement') {
            collectLiteralTexts(child);
          }
        }
      };

      collectLiteralTexts(element);

      // Join before normalizing so inline boundaries and repeated words survive.
      const text = fragments.join('').replace(/\s+/g, ' ').trim();
      return hasDynamicText || !text ? [] : [text];
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
        if (hasUncertainText(currentElement, element)) {
          hasDynamicText = true;
          return;
        }

        for (const child of currentElement.children) {
          if (child.type === 'VText') {
            fragments.push(child.value);
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

      return fragments.join('').replace(/\s+/g, ' ').trim() || undefined;
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

      return text.replace(/(?<![\p{L}\p{N}\p{M}_])[\p{L}\p{N}]/gu, (character) => character.toUpperCase());
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
        const literalTexts = (descendantTextComponents.length
          ? descendantTextMatch?.literalTexts ?? []
          : componentOptions.matchesLiteralText
            ? getLiteralTexts(node)
            : []).map(safeTemplateCommentText);
        const rawSourceText = componentOptions.sourceComponent && componentOptions.sourceTraversal === 'native-only'
          ? getSourceText(node, componentOptions.sourceComponent)
          : undefined;
        const sourceText = rawSourceText
          ? safeTemplateCommentText(transformSourceText(rawSourceText, componentOptions.sourceTextTransform))
          : undefined;
        const inferredText = sourceText
          ? componentOptions.suffix && !sourceText.endsWith(componentOptions.suffix)
            ? `${sourceText} ${componentOptions.suffix}`
            : sourceText
          : literalTexts.length === 1
            ? literalTexts[0]
            : undefined;
        const exactText = componentOptions.equals && safeTemplateCommentText(componentOptions.equals);
        const autofixText = exactText ?? inferredText;
        const canCreateComment = ['missing-only', 'replace'].includes(componentOptions.autofix);
        const canReplaceComment = componentOptions.autofix === 'replace';

        const previousToken = getStandaloneTemplateComment(sourceCode, tokenStore, node, { allowEmpty: true });
        const suffix = componentOptions.endsWith ?? componentOptions.suffix;
        const expectedTexts = literalTexts.map((text) => JSON.stringify(text)).join(' or ');
        const requirement = autofixText
          ? `Use exactly <!-- ${autofixText} -->.`
          : literalTexts.length
            ? `Use one of these comment texts: ${expectedTexts}.`
            : suffix
              ? `Write a descriptive comment whose text ends with "${suffix}".`
              : 'Describe the component\'s purpose; an empty comment does not satisfy this rule.';

        // A valid comment must occupy its own line immediately above the component.
        if (!previousToken?.value.trim()) {
          context.report({
            loc: node.startTag.loc,
            messageId: 'expected',
            data: {
              component: node.rawName,
              requirement,
            },
            fix: canCreateComment && autofixText
              ? (fixer) => previousToken
                ? fixer.replaceText(previousToken, `<!-- ${autofixText} -->`)
                : insertStandaloneTemplateComment(fixer, sourceCode, node, autofixText)
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

        if (exactText && commentText !== exactText) {
          context.report({
            loc: previousToken.loc,
            messageId: 'expectedExact',
            data: {
              component: node.rawName,
              text: exactText,
            },
            fix: canReplaceComment
              ? (fixer) => fixer.replaceText(previousToken, `<!-- ${exactText} -->`)
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
                expected: expectedTexts,
                actual: JSON.stringify(commentText),
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
