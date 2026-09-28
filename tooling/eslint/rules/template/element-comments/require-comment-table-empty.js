import requireElementComment from '../../../helpers/require-element-comment.js';

export default requireElementComment({
  elements: ['TableEmpty'],
  autofix: 'missing-only',
  matchesDescendantText: 'EmptyTitle',
});
