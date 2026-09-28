import requireElementAttribute from '../../../helpers/require-element-attribute.js';
import hasAttributeValue from '../../../helpers/has-attribute-value.js';

export default requireElementAttribute({
  elements: ['Input', 'input'],
  attribute: 'id',
  validate: ([attribute]) => hasAttributeValue(attribute),
  message: '<{{ component }}> requires an explicit, nonempty id or :id attribute.',
});
