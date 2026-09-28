import enforceElementBlankLine from '../../../helpers/enforce-element-blank-line.js';

export default enforceElementBlankLine({
  elements: ['DialogFooter', 'dialog-footer'],
  position: 'above',
  message: 'Expected a blank line before <DialogFooter>.',
});
