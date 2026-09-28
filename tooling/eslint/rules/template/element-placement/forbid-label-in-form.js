import { findContainingForm, templateVisitor } from '../../../helpers/field-structure.js';

export default {
  meta: {
    type: 'problem',
    docs: { description: 'forbid Label components inside native forms' },
    schema: [],
    messages: { forbidden: 'Do not use <Label> inside <form>.' },
  },

  create(context) {
    return templateVisitor(context, {
      VElement(node) {
        if (node.rawName === 'Label' && findContainingForm(node)) {
          context.report({ loc: node.startTag.loc, messageId: 'forbidden' });
        }
      },
    });
  },
};
