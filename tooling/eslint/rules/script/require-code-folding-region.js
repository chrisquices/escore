import getCodeFoldingRegions from '../../helpers/code-folding-regions.js';

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'require valid paired code-folding region markers and 140-character opening banners',
    },
    fixable: 'code',
    schema: [],
    messages: {
      format: 'Use a standalone // region --- Title --- banner with trailing dashes. Malformed banners must be corrected manually.',
      length: 'Region banner must contain exactly 140 characters, including indentation; found {{ length }}.',
      endFormat: 'Use a standalone // endregion comment.',
      unmatchedEnd: 'This endregion has no matching region in this script block.',
      unclosed: 'Close this region with // endregion in the same script block.',
    },
  },

  create(context) {
    return {
      Program() {
        for (const { issues } of getCodeFoldingRegions(context.sourceCode)) {
          for (const issue of issues) context.report(issue);
        }
      },
    };
  },
};
