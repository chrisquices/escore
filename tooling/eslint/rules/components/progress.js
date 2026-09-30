import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {Progress: {flags: ['required', 'one-liner']}},
];

export default createComponentRules(structure);
