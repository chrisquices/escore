import requireElementComment from '../../../helpers/require-element-comment.js';

export default requireElementComment({
  elements: ['DialogClose'],
  autofix: 'missing-only',
  matchesLiteralText: true,
  within: 'DialogFooter',
});
