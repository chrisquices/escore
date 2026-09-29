// Keep at most one consecutive blank line; preserve literals and whitespace-sensitive content.
export default {
  meta: {
    type: 'layout',
    docs: { description: 'collapse consecutive blank lines across JavaScript, TypeScript, and Vue files' },
    fixable: 'whitespace',
    schema: [],
    messages: { extra: 'Keep at most one consecutive blank line.' },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const documentFragment = sourceCode.parserServices.getDocumentFragment?.();

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
        for (const comment of documentFragment?.comments ?? []) preserve(comment);

        for (const block of documentFragment?.children ?? []) {
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
