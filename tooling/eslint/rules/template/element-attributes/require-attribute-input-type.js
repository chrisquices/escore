import requireElementAttribute from '../../../helpers/require-element-attribute.js';
import hasAttributeValue from '../../../helpers/has-attribute-value.js';

export default requireElementAttribute({
  elements: ['Input', 'input'],
  attribute: 'type',
  validate: (attributes) => attributes.some(hasAttributeValue),
  message: '<{{ component }}> requires an explicit, nonempty type or :type attribute.',
});
