import requireElementAttribute, { hasElementAttribute } from '../../../helpers/require-element-attribute.js';

export default requireElementAttribute({
  elements: ['Dialog'],
  attribute: 'processing',
  directive: 'bind',
  when: (node) => hasElementAttribute(node, 'open', { directive: 'bind' }),
  type: 'problem',
  message: '<Dialog> with :open also requires :processing.',
});
