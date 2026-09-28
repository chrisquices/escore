import requireElementComment from '../../../helpers/require-element-comment.js';

export default requireElementComment({
  elements: ['Button'],
  autofix: 'missing-only',
  matchesLiteralText: true,
  notWithin: [
    'ComboboxTrigger',
    'ContextMenuTrigger',
    'DialogClose',
    'DropdownMenuTrigger',
    'PopoverTrigger',
    'nav',
    'CreatePortfolioDialog',
  ],
});
