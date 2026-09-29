import enforceElementOneLiner from '../../../helpers/enforce-element-one-liner.js';

export default enforceElementOneLiner({
  elements: ['EmptyDescription', 'empty-description'],
  textOnly: true,
  message: 'Keep text-only <{{ component }}> on one line.',
});
