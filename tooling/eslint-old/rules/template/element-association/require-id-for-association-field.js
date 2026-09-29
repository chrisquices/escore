import { isField, isFieldContent, isFieldLabel, isHiddenInput, isInput } from '../../../helpers/field-structure.js';
import getElementAttributeValue, { sameElementAttributeValue } from '../../../helpers/get-element-attribute-value.js';

// Compare authored values/expressions, never execute bindings or rewrite IDs.
export default {
  meta: {
    type: 'problem',
    docs: { description: 'match FieldLabel for and FieldContent input id within the same Field' },
    schema: [],
    messages: {
      mismatch: 'FieldLabel bindings [{{ labels }}] do not match input bindings [{{ inputs }}] in this <Field>. Pair each for/:for with the intended id/:id using the same value or dynamic expression. Preserve existing references to these IDs.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const services = sourceCode.parserServices;
    if (!services.defineTemplateBodyVisitor) return {};

    const attributeValue = getElementAttributeValue(sourceCode);

    return services.defineTemplateBodyVisitor({
      VElement(node) {
        if (!isField(node)) return;

        // Direct relationships exclude nested Fields and malformed structures,
        // whose placement and required attributes have their own rules.
        const labels = node.children.filter(isFieldLabel);
        const inputs = node.children.filter(isFieldContent)
          .flatMap((content) => content.children.filter(isInput))
          .filter((input) => !isHiddenInput(input, attributeValue));
        const labelValues = labels.map((label) => attributeValue(label, 'for')).filter(Boolean);
        const inputValues = inputs.map((input) => attributeValue(input, 'id')).filter(Boolean);
        if (!labelValues.length || !inputValues.length) return;

        const mismatch = labelValues.find((label) => !inputValues.some((input) => sameElementAttributeValue(input, label)))
          ?? inputValues.find((input) => !labelValues.some((label) => sameElementAttributeValue(label, input)));
        if (!mismatch) return;

        context.report({
          node: mismatch.attribute,
          messageId: 'mismatch',
          data: {
            labels: labelValues.map(({ attribute }) => sourceCode.getText(attribute)).join(', '),
            inputs: inputValues.map(({ attribute }) => sourceCode.getText(attribute)).join(', '),
          },
        });
      },
    });
  },
};
