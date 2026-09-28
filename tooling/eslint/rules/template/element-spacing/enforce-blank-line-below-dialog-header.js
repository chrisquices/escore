import enforceElementBlankLine from '../../../helpers/enforce-element-blank-line.js';

export default enforceElementBlankLine({
  elements: ['DialogHeader', 'dialog-header'],
  position: 'below',
  message: 'Expected a blank line after </DialogHeader>.',
});
