import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Avatar: {
            flags: ['required'],
            children: [
                {AvatarImage: {flags: ['required', 'comment-source:alt', 'one-liner']}},
                {AvatarFallback: {flags: ['required', 'comment-source', 'one-liner']}},
            ],
        },
    },
];

export default createComponentRules(structure);
