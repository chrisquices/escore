import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {Badge: {flags: ['required', 'comment-source', 'multi-liner']}},
];

export default createComponentRules(structure);
