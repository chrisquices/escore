import requireElementComment from '../../../helpers/require-element-comment.js';

export default requireElementComment({
  elements: ['Alert'],
  autofix: 'missing-only',
  matchesDescendantText: 'AlertTitle',
});
