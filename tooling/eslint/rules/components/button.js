import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {Button: {flags: ['required', 'comment-source', 'multi-liner', 'non-empty']}},
];

export default createComponentRules(structure);
