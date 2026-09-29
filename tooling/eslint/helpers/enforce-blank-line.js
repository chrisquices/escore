import { belongsToStructure, matchesStructureElement } from './element-structure.js';

const linePrefix = (text, offset) => text.slice(text.lastIndexOf('\n', offset - 1) + 1, offset);
const meaningfulToken = { includeComments: true, filter: (token) => token.type !== 'HTMLWhitespace' };

// One positional helper for template elements, optionally scoped to a component family.
export default ({ elements, position, structure, message }) => {
  if (position !== 'above' && position !== 'below') {
    throw new TypeError('Blank-line position must be "above" or "below".');
  }

  return {
    meta: {
      type: 'layout',
      docs: { description: `enforce a blank line ${position} ${elements.join(' and ')}` },
      fixable: 'whitespace',
      schema: [],
      messages: {
        spacing: message ?? 'Keep one blank line {{ position }} <{{ element }}>. Preserve attached comments with the component.',
      },
    },

    create(context) {
      const sourceCode = context.sourceCode;
      const services = sourceCode.parserServices;
      if (!services.defineTemplateBodyVisitor) return {};

      const tokenStore = services.getTemplateBodyTokenStore();
      const text = sourceCode.text;
      const newline = text.includes('\r\n') ? '\r\n' : '\n';
      const below = position === 'below';

      return services.defineTemplateBodyVisitor({
        VElement(node) {
          if (!elements.some((element) => matchesStructureElement(node, element))) return;
          if (structure && !belongsToStructure(node, structure)) return;

          let anchor = below ? node : node.startTag;

          // Above: keep standalone leading comments attached to the element.
          // Below: keep same-line trailing comments attached to the element.
          while (true) {
            const comment = below
              ? tokenStore.getTokenAfter(anchor, meaningfulToken)
              : tokenStore.getTokenBefore(anchor, meaningfulToken);
            if (comment?.type !== 'HTMLComment') break;

            const gap = below
              ? text.slice(anchor.range[1], comment.range[0])
              : text.slice(comment.range[1], anchor.range[0]);
            if (!/^\s*$/.test(gap)) break;

            if (below) {
              if (comment.loc.start.line !== anchor.loc.end.line) break;
            } else if (comment.loc.end.line >= anchor.loc.start.line
              || !/^[\t ]*$/.test(linePrefix(text, comment.range[0]))) break;

            anchor = comment;
          }

          const offset = anchor.range[below ? 1 : 0];
          const gap = below ? text.slice(offset).match(/^\s*/)[0] : text.slice(0, offset).match(/\s*$/)[0];
          if ((gap.match(/\r\n|\n|\r/g) ?? []).length === 2) return;

          const range = below ? [offset, offset + gap.length] : [offset - gap.length, offset];
          // Copy only existing whitespace, never a line prefix containing markup.
          const indent = gap.split(/\r\n|\n|\r/).at(-1);

          context.report({
            loc: below ? (node.endTag ?? node.startTag).loc : node.startTag.loc,
            messageId: 'spacing',
            data: { position, element: node.rawName },
            fix: (fixer) => fixer.replaceTextRange(range, newline + newline + indent),
          });
        },
      });
    },
  };
};
