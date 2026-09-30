import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {Tree: {flags: ['required']}},
];

export default createComponentRules(structure);
