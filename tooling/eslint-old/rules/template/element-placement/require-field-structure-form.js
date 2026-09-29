import { findContainingForm, isField, isFieldContent, isFieldLabel, isHiddenInput, isInput, templateVisitor } from '../../../helpers/field-structure.js';
import getElementAttributeValue from '../../../helpers/get-element-attribute-value.js';

// Report only: wrapping controls or adding labels can change a form's layout.
export default {
  meta: {
    type: 'problem',
    docs: { description: 'require every form input inside FieldContent directly in Field, with a sibling FieldLabel unless its type is explicitly hidden' },
    schema: [],
    messages: {
      content: 'An <{{ component }}> inside <form> must be a direct child of <FieldContent>, directly inside <Field>.',
      label: 'This <{{ component }}> requires a <FieldLabel> directly inside the same <Field>.',
    },
  },

  create(context) {
    const attributeValue = getElementAttributeValue(context.sourceCode);
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

        if (!isHiddenInput(node, attributeValue) && !field.children.some(isFieldLabel)) {
          context.report({ loc: node.startTag.loc, messageId: 'label', data });
        }
      },
    });
  },
};
