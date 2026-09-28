import forbidNativeElement from '../../../helpers/forbid-native-element.js';
import { findContainingForm } from '../../../helpers/field-structure.js';

export default forbidNativeElement({
  elements: ['label'],
  message: (node) => findContainingForm(node)
    ? 'Inside <form>, replace native <label> with <FieldLabel> directly inside <Field>; <Label> is also forbidden here. Preserve the label text and for binding, and import FieldLabel from the project\'s UI kit if needed.'
    : 'Replace native <label> with the UI kit\'s <Label>, or <FieldLabel> directly inside <Field> when using the Field structure. Preserve the label text and for binding, and import the chosen component if needed.',
});
