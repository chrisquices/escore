import requireElementComment from '../../../helpers/require-element-comment.js';

export default requireElementComment({
  elements: ['Badge'],
  autofix: 'missing-only',
  matchesLiteralText: true,
  notWithin: 'TableCell',
});
