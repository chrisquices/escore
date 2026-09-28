import { isDefinePropsExpression } from '../../helpers/script-props.js';

export default {
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
