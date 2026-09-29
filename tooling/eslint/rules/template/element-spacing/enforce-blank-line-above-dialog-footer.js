import enforceBlankLine from '../../../helpers/enforce-blank-line.js';

export default enforceBlankLine({
  elements: ['DialogFooter', 'dialog-footer'],
  position: 'above',
  message: 'Expected a blank line before <DialogFooter>.',
});
