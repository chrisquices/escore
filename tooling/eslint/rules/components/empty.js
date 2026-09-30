import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Empty: {
            flags: ['required'],
            children: [
                {
                    EmptyHeader: {
                        flags: ['required'],
                        children: [
                            {EmptyMedia: {flags: ['optional']}},
                            {EmptyTitle: {flags: ['required', 'comment-source', 'one-liner']}},
                            {EmptyDescription: {flags: ['required', 'comment-source', 'one-liner']}},
                        ],
                    },
                },
                {BlankLine: {flags: ['required']}},
                {
                    EmptyContent: {
                        flags: ['optional'],
                        children: [
                            {Button: {flags: ['required']}},
                        ],
                    },
                },
            ],
        },
    },
];

export default createComponentRules(structure, {propsScope: 'family'});
