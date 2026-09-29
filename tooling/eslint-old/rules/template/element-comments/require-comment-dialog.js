import requireElementComment from '../../../helpers/require-element-comment.js';

export default requireElementComment({
  elements: ['Dialog'],
  autofix: 'missing-only',
  sourceComponent: 'DialogTitle',
  sourceTextTransform: 'title-case',
  sourceTraversal: 'native-only',
  suffix: 'Dialog',
});
