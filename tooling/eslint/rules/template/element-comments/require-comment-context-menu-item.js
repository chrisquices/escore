import requireElementComment from '../../../helpers/require-element-comment.js';

export default requireElementComment({
  elements: ['ContextMenuItem'],
  autofix: 'missing-only',
  matchesLiteralText: true,
});
