import requireElementComment from '../../../helpers/require-element-comment.js';

export default requireElementComment({
  elements: ['Empty'],
  autofix: 'missing-only',
  matchesDescendantText: ['EmptyTitle', 'EmptyDescription'],
  notWithin: 'TableEmpty',
});
