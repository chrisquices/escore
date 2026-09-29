import { isField, isFieldLabel, templateVisitor } from '../../../helpers/field-structure.js';

export default {
  meta: {
    type: 'problem',
    docs: { description: 'require FieldLabel to be a direct child of Field' },
    schema: [],
    messages: { parent: '<FieldLabel> must be a direct child of <Field>.' },
  },

  create(context) {
    return templateVisitor(context, {
      VElement(node) {
        if (isFieldLabel(node) && !isField(node.parent)) {
          context.report({ loc: node.startTag.loc, messageId: 'parent' });
        }
      },
    });
  },
};
