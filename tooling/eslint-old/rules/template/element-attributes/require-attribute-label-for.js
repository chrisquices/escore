import requireElementAttribute from '../../../helpers/require-element-attribute.js';

export default requireElementAttribute({
  elements: ['Label'],
  attribute: 'for',
  message: '<Label> requires an explicit for or :for attribute.',
});
