import requireElementComment from '../../../helpers/require-element-comment.js';

export default requireElementComment({
  elements: ['FieldSet'],
  autofix: 'missing-only',
  matchesDescendantText: 'FieldLegend',
});
