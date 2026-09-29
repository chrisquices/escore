import requireElementAttribute, { hasElementAttribute } from '../../../helpers/require-element-attribute.js';

export default requireElementAttribute({
  elements: ['AlertDialog'],
  attribute: 'dismissible',
  directive: 'bind',
  when: (node) => hasElementAttribute(node, 'open', { directive: 'bind' }),
  type: 'problem',
  message: '<AlertDialog> with :open also requires :dismissible.',
});
