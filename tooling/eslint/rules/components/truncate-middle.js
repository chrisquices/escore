import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {TruncateMiddle: {flags: ['required', 'comment-source', 'one-liner', 'non-empty']}},
];

export default createComponentRules(structure);
