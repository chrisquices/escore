import requireElementComment from '../../../helpers/require-element-comment.js';

export default requireElementComment({
  elements: ['SidepanelHeader'],
  autofix: 'missing-only',
  sourceComponent: 'SidepanelTitle',
  sourceTraversal: 'native-only',
});
