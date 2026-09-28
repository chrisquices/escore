import requireElementComment from '../../../helpers/require-element-comment.js';

export default requireElementComment({
  elements: ['PageSection'],
  autofix: 'missing-only',
  sourceComponent: 'PageSectionHeadingTitle',
  sourceTraversal: 'native-only',
  suffix: 'Page',
});
