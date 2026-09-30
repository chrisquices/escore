import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {DatePicker: {flags: ['required', 'self-closing', 'multi-liner-attributes']}},
];

export default createComponentRules(structure);
