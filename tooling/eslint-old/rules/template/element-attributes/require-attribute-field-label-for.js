import requireElementAttribute from '../../../helpers/require-element-attribute.js';
import hasAttributeValue from '../../../helpers/has-attribute-value.js';

export default requireElementAttribute({
  elements: ['FieldLabel', 'field-label'],
  attribute: 'for',
  validate: ([attribute]) => hasAttributeValue(attribute),
  message: '<FieldLabel> requires an explicit, nonempty for or :for attribute.',
});
