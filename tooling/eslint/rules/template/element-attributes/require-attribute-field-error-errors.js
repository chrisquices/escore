import requireElementAttribute from '../../../helpers/require-element-attribute.js';

export default requireElementAttribute({
  elements: ['FieldError', 'field-error'],
  attribute: 'errors',
  directive: 'bind',
  message: '<FieldError> requires an explicit :errors binding.',
});
