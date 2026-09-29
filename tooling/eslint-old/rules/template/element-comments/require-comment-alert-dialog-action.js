import requireElementComment from '../../../helpers/require-element-comment.js';

export default requireElementComment({
  elements: ['AlertDialogAction'],
  autofix: 'missing-only',
  matchesLiteralText: true,
  within: 'AlertDialogFooter',
});
