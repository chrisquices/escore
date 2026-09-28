import requireElementAttribute from '../../../helpers/require-element-attribute.js';

export default requireElementAttribute({
  elements: ['Field', 'field'],
  attribute: 'data-invalid',
  directive: 'bind',
  message: '<Field> requires an explicit :data-invalid binding.',
});
