import forbidElementOneLiner from '../../../helpers/forbid-element-one-liner.js';

export default forbidElementOneLiner({
  elements: ['TableHead', 'table-head'],
  message: 'Put <{{ component }}> content on separate lines between its opening and closing tags.',
});
