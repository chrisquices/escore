import { findContainingForm, isField, isFieldContent, isFieldLabel, isInput, templateVisitor } from '../../../helpers/field-structure.js';

// Report only: wrapping controls or adding labels can change a form's layout.
export default {
  meta: {
    type: 'problem',
    docs: { description: 'require every form input to use Field, FieldLabel and FieldContent' },
    schema: [],
    messages: {
      content: 'An <{{ component }}> inside <form> must be a direct child of <FieldContent>, directly inside <Field>.',
      label: 'This <{{ component }}> requires a <FieldLabel> directly inside the same <Field>.',
    },
  },

  create(context) {
    return templateVisitor(context, {
      VElement(node) {
        if (!isInput(node)) return;
        const form = findContainingForm(node);
        if (!form) return;

        const content = node.parent;
        const field = content.parent;
        const data = { component: node.rawName };

        if (!isFieldContent(content) || !isField(field) || findContainingForm(field) !== form) {
          context.report({ loc: node.startTag.loc, messageId: 'content', data });
          return;
        }

        if (!field.children.some(isFieldLabel)) {
          context.report({ loc: node.startTag.loc, messageId: 'label', data });
        }
      },
    });
  },
};
