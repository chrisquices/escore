import requireElementComment from '../../../helpers/require-element-comment.js';

export default requireElementComment({
  elements: ['AlertDialog'],
  autofix: 'missing-only',
  sourceComponent: 'AlertDialogTitle',
  sourceTextTransform: 'title-case',
  sourceTraversal: 'native-only',
  suffix: 'Alert Dialog',
});
