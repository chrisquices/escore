import enforceElementBlankLine from '../../../helpers/enforce-element-blank-line.js';

export default enforceElementBlankLine({
  elements: ['AlertDialogHeader', 'alert-dialog-header'],
  position: 'below',
  message: 'Expected a blank line after </AlertDialogHeader>.',
});
