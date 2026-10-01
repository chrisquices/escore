import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {Tree: {flags: ['required', 'multi-liner']}},
];

export default createComponentRules(structure);
