import requireElementComment from '../../../helpers/require-element-comment.js';

export default requireElementComment({
  elements: ['AlertDialogCancel'],
  autofix: 'missing-only',
  matchesLiteralText: true,
  within: 'AlertDialogFooter',
});
