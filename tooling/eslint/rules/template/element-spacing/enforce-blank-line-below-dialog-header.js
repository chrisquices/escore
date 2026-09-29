import enforceBlankLine from '../../../helpers/enforce-blank-line.js';

export default enforceBlankLine({
  elements: ['DialogHeader', 'dialog-header'],
  position: 'below',
  message: 'Expected a blank line after </DialogHeader>.',
});
