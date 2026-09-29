import enforceElementAttributeOrder from '../../../helpers/enforce-element-attribute-order.js';

export default enforceElementAttributeOrder({
  elements: ['AlertDialog'],
  order: ['open', 'dismissible', 'processing', '@update:open'],
  message: 'Move {{expected}} before {{actual}} on <{{component}}. Order existing attributes as: {{order}}. Preserve values and bindings; this rule does not require adding absent attributes.',
});
