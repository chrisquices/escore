// Parse each Vue script block independently, keeping malformed markers recognizable.
export default (sourceCode) => {
  const documentFragment = sourceCode.parserServices.getDocumentFragment?.();
  if (!documentFragment) return [];

  const comments = sourceCode.getAllComments();
  const scripts = documentFragment.children.filter(
    (node) => node.type === 'VElement' && node.rawName === 'script',
  );

  return scripts.map((script) => {
    const issues = [];
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
          issues.push({ loc: comment.loc, messageId: 'format' });
          continue;
        }

        const length = Array.from(line).length;

        if (length !== 140) {
          issues.push({
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
          issues.push({ loc: comment.loc, messageId: 'endFormat' });
        }

        const opening = stack.pop();

        if (opening) {
          regions.push([opening.range[1], comment.range[0]]);
        } else {
          issues.push({ loc: comment.loc, messageId: 'unmatchedEnd' });
        }
      }
    }

    for (const opening of stack) {
      issues.push({ loc: opening.loc, messageId: 'unclosed' });
    }

    return { start, end, regions, issues };
  });
};
