import requireElementComment from '../../../helpers/require-element-comment.js';

export default requireElementComment({
  elements: ['Combobox'],
  autofix: 'missing-only',
  sourceComponent: 'ComboboxTrigger',
  sourceTraversal: 'native-only',
  notWithin: ['Field'],
});
