import { isField, isFieldContent, templateVisitor } from '../../../helpers/field-structure.js';

export default {
  meta: {
    type: 'problem',
    docs: { description: 'require FieldContent to be a direct child of Field' },
    schema: [],
    messages: { parent: '<FieldContent> must be a direct child of <Field>.' },
  },

  create(context) {
    return templateVisitor(context, {
      VElement(node) {
        if (isFieldContent(node) && !isField(node.parent)) {
          context.report({ loc: node.startTag.loc, messageId: 'parent' });
        }
      },
    });
  },
};
