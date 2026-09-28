import requireElementComment from '../../../helpers/require-element-comment.js';

export default requireElementComment({
  elements: ['TableHead'],
  autofix: 'replace',
  matchesLiteralText: true,
});
