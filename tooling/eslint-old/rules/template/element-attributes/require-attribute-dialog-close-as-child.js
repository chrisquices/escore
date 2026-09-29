import requireElementAsChild from '../../../helpers/require-element-as-child.js';

export default requireElementAsChild({
  elements: ['DialogClose', 'dialog-close'],
  within: ['DialogFooter', 'dialog-footer'],
  children: ['Button'],
  boundaries: ['Dialog', 'AlertDialog', 'alert-dialog'],
});
