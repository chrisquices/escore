import requireElementComment from '../../../helpers/require-element-comment.js';

export default requireElementComment({
  elements: ['Field'],
  autofix: 'missing-only',
  matchesDescendantText: 'FieldLabel',
  notWithin: ['TableCell'],
});
