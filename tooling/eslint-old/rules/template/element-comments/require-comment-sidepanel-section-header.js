import requireElementComment from '../../../helpers/require-element-comment.js';

export default requireElementComment({
  elements: ['SidepanelSectionHeader'],
  autofix: 'missing-only',
  sourceComponent: 'SidepanelSectionTitle',
  sourceTraversal: 'native-only',
});
