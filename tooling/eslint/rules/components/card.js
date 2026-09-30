import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Card: {
            flags: ['required'],
            children: [
                {
                    CardHeader: {
                        flags: ['required'],
                        children: [
                            {CardTitle: {flags: ['required', 'comment-source', 'one-liner', 'non-empty']}},
                            {CardDescription: {flags: ['optional', 'comment-source', 'one-liner', 'non-empty']}},
                            {CardAction: {flags: ['optional', 'non-empty', 'multi-liner']}},
                        ],
                    },
                },
                {BlankLine: {flags: ['required']}},
                {CardContent: {flags: ['required', 'non-empty']}},
                {BlankLine: {flags: ['required']}},
                {CardFooter: {flags: ['optional', 'non-empty']}},
            ],
        },
    },
];

export default createComponentRules(structure);
