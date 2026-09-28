import requireElementComment from '../../../helpers/require-element-comment.js';

export default requireElementComment({
  elements: ['DropdownMenuItem'],
  autofix: 'missing-only',
  matchesLiteralText: true,
});
