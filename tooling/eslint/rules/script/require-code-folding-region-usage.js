import getCodeFoldingRegions from '../../helpers/code-folding-regions.js';
import { isPropsDeclarator } from '../../helpers/script-props.js';

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'require script code inside code-folding regions, except imports and const props' },
    schema: [],
    messages: {
      outside: 'Wrap this entire statement in a named region: // region --- Meaningful Name --- followed by the code and // endregion in the same script block. Pad only the banner\'s trailing dashes to 140 characters total, including indentation. Only imports and const props = defineProps(...) (including withDefaults) may remain outside regions.',
    },
  },

  create(context) {
    return {
      Program(program) {
        for (const { start, end, regions } of getCodeFoldingRegions(context.sourceCode)) {
          for (const statement of program.body) {
            if (statement.range[0] < start || statement.range[1] > end
              || ['ImportDeclaration', 'TSImportEqualsDeclaration'].includes(statement.type)
              || (statement.type === 'VariableDeclaration' && statement.kind === 'const'
                && statement.declarations.every(isPropsDeclarator))) {
              continue;
            }

            // The complete statement, including its nested code, must fit inside a region.
            const enclosed = regions.some(([regionStart, regionEnd]) => (
              regionStart <= statement.range[0] && regionEnd >= statement.range[1]
            ));

            if (!enclosed) context.report({ node: statement, messageId: 'outside' });
          }
        }
      },
    };
  },
};
