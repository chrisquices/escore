import requireElementAttribute from '../../../helpers/require-element-attribute.js';
import hasAttributeValue from '../../../helpers/has-attribute-value.js';

export default requireElementAttribute({
  elements: ['Button'],
  attribute: 'variant',
  validate: (attributes) => attributes.some(hasAttributeValue),
  message: '<{{ component }}> requires an explicit, nonempty variant or :variant attribute.',
});
