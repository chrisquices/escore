import requireElementComment from '../../../helpers/require-element-comment.js';

export default requireElementComment({
  elements: ['StatCard'],
  autofix: 'missing-only',
  matchesDescendantText: 'StatCardLabel',
});
