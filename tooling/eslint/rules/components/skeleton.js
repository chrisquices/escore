import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {Skeleton: {flags: ['required', 'one-liner']}},
];

export default createComponentRules(structure);
