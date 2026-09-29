import requireElementComment from '../../../helpers/require-element-comment.js';

export default requireElementComment({
  elements: ['Card'],
  autofix: 'missing-only',
  matchesDescendantText: 'CardTitle',
  notWithin: ['Tabs', 'TabsContent', 'PageSectionContent'],
});
