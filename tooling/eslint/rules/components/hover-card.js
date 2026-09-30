import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        HoverCard: {
            flags: ['required'],
            children: [
                {HoverCardTrigger: {flags: ['required', 'comment-source', 'non-empty']}},
                {BlankLine: {flags: ['required']}},
                {HoverCardContent: {flags: ['required', 'non-empty']}},
            ],
        },
    },
];

export default createComponentRules(structure);
