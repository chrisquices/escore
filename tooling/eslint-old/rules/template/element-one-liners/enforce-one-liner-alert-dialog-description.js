import enforceElementOneLiner from '../../../helpers/enforce-element-one-liner.js';

export default enforceElementOneLiner({
  elements: ['AlertDialogDescription', 'alert-dialog-description'],
  textOnly: true,
  message: 'Keep text-only <{{ component }}> on one line.',
});
