import forbidNativeElement from '../../../helpers/forbid-native-element.js';

export default forbidNativeElement({
  elements: ['label'],
  message: 'Native <label> is not allowed. Use <Label>, or <FieldLabel> inside a <Field>.',
});
