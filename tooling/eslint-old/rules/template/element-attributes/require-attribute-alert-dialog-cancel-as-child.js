import requireElementAsChild from '../../../helpers/require-element-as-child.js';

export default requireElementAsChild({
  elements: ['AlertDialogCancel', 'alert-dialog-cancel'],
  within: ['AlertDialogFooter', 'alert-dialog-footer'],
  children: ['Button'],
  boundaries: ['Dialog', 'AlertDialog', 'alert-dialog'],
});
