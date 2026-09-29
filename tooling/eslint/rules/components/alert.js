import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Alert: {
            flags: ['required'],
            children: [
                {AlertTitle: {flags: ['required', 'comment-source', 'one-liner']}},
                {AlertDescription: {flags: ['required', 'comment-source', 'one-liner']}},
            ],
        },
    },
];

export default createComponentRules(structure);
