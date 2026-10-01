import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Label: {flags: ['required', 'one-liner', 'non-empty']}},
];

export default createComponentRules(structure);
