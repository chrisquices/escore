import forbidNativeElement from '../../../helpers/forbid-native-element.js';

export default forbidNativeElement({
  elements: ['button'],
  message: 'Replace native <button> with the UI kit\'s <Button>. Preserve its behavior, import Button if needed, and specify type, variant, and size.',
});
