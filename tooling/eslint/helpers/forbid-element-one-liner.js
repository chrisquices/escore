// Shared multiline element structure and boundary fixes; attribute formatting is preserved.

export default ({ elements, message = 'Keep <{{ component }}> opening tag, content, and closing tag on separate lines.' }) => ({
  meta: {
    type: 'layout',
    docs: { description: 'forbid one-line ' + elements.join(' and ') + ' elements' },
    fixable: 'code',
    schema: [],
    messages: {
      newline: message,
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const parserServices = sourceCode.parserServices;

    if (!parserServices.defineTemplateBodyVisitor) {
      return {};
    }

    const newline = sourceCode.text.includes('\r\n') ? '\r\n' : '\n';
    const indentation = (node) => sourceCode.lines[node.loc.start.line - 1].match(/^[\t ]*/)[0];

    return parserServices.defineTemplateBodyVisitor({
      VElement(node) {
        if (!elements.includes(node.rawName)) return;
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
