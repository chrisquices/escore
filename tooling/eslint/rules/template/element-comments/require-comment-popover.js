import requireElementComment from '../../../helpers/require-element-comment.js';

export default requireElementComment({
  elements: ['Popover'],
  autofix: 'missing-only',
  matchesDescendantText: 'PopoverTrigger',
});
