import { findContainingForm, findOwningField, isFieldLabel, isHiddenInput, isInput } from '../../../helpers/field-structure.js';
import getElementAttributeValue, { sameElementAttributeValue } from '../../../helpers/get-element-attribute-value.js';

// Report only: label text, component imports and placement need project context.
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'require Input and native input to have a matching label: FieldLabel directly in their Field, or Label outside Fields; match for/id values and dynamic binding scopes; exempt explicit type="hidden" only',
    },
    schema: [],
    messages: {
      missing: 'No corresponding <{{ label }}> was found for <{{ component }}> ({{ id }}). {{ placement }} Match its for/:for to this input\'s id/:id using the same value or dynamic expression in the same loop/slot scope. Add a meaningful label and import the component if needed; a placeholder or native <label> does not satisfy this rule.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const services = sourceCode.parserServices;
    const template = sourceCode.ast.templateBody;
    if (!template || !services.defineTemplateBodyVisitor) return {};

    const attributeValue = getElementAttributeValue(sourceCode);
    const inputs = [];
    const labelsById = new Map();

    return services.defineTemplateBodyVisitor({
      VElement(node) {
        if (isInput(node) && !isHiddenInput(node, attributeValue)) inputs.push(node);
        if (node.rawName !== 'Label' && !isFieldLabel(node)) return;

        const value = attributeValue(node, 'for');
        if (!value) return;
        const labels = labelsById.get(value.key) ?? [];
        labels.push({ node, value, field: findOwningField(node), form: findContainingForm(node) });
        labelsById.set(value.key, labels);
      },

      'VElement:exit'(node) {
        if (node !== template) return;

        for (const input of inputs) {
          const id = attributeValue(input, 'id');
          const field = findOwningField(input);
          const form = findContainingForm(input);
          const requiresFieldLabel = Boolean(field || form);
          const candidates = id ? labelsById.get(id.key) ?? [] : [];
          const hasLabel = candidates.some((label) => {
            if (!sameElementAttributeValue(id, label.value)) return false;
            if (requiresFieldLabel) return field && isFieldLabel(label.node) && label.node.parent === field;
            return label.node.rawName === 'Label' && !label.field && label.form === form;
          });
          if (hasLabel) continue;

          context.report({
            loc: input.startTag.loc,
            messageId: 'missing',
            data: {
              component: input.rawName,
              id: id ? sourceCode.getText(id.attribute) : 'missing or empty id/:id',
              label: requiresFieldLabel ? 'FieldLabel' : 'Label',
              placement: field
                ? 'Add <FieldLabel> as a direct child of this input\'s own <Field>.'
                : form
                  ? 'Inside <form>, wrap the input in <FieldContent> directly inside <Field> and add a sibling <FieldLabel>; <Label> is forbidden in forms.'
                  : 'Add a <Label> outside Fields in this template, associated with this input.',
            },
          });
        }
      },
    });
  },
};
