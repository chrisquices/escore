import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Dialog: {
            flags: ['required'],
            children: [
                {DialogTrigger: {flags: ['optional', 'non-empty']}},
                {DialogOverlay: {flags: ['optional', 'one-liner']}},
                {
                    Group: {
                        flags: ['required', 'one-of'],
                        children: [
                            {
                                DialogContent: {
                                    flags: ['required'],
                                    children: [
                                        {
                                            DialogHeader: {
                                                flags: ['required'],
                                                children: [
                                                    {DialogTitle: {flags: ['required', 'comment-source', 'one-liner', 'non-empty']}},
                                                    {DialogDescription: {flags: ['optional', 'comment-source', 'one-liner', 'non-empty']}},
                                                ],
                                            },
                                        },
                                        {BlankLine: {flags: ['required']}},
                                        {Form: {flags: ['optional', 'non-empty']}},
                                        {div: {flags: ['optional', 'repeatable']}},
                                        {BlankLine: {flags: ['required']}},
                                        {
                                            DialogFooter: {
                                                flags: ['optional', 'unordered'],
                                                children: [
                                                    {Comment: {flags: ['required']}},
                                                    {DialogClose: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                                    {Button: {flags: ['optional', 'repeatable']}},
                                                ],
                                            },
                                        },
                                    ],
                                },
                            },
                            {
                                DialogScrollContent: {
                                    flags: ['required'],
                                    children: [
                                        {
                                            DialogHeader: {
                                                flags: ['required'],
                                                children: [
                                                    {DialogTitle: {flags: ['required', 'comment-source', 'one-liner', 'non-empty']}},
                                                    {DialogDescription: {flags: ['optional', 'comment-source', 'one-liner', 'non-empty']}},
                                                ],
                                            },
                                        },
                                        {BlankLine: {flags: ['required']}},
                                        {Form: {flags: ['optional', 'non-empty']}},
                                        {div: {flags: ['optional', 'repeatable']}},
                                        {BlankLine: {flags: ['required']}},
                                        {
                                            DialogFooter: {
                                                flags: ['optional', 'unordered'],
                                                children: [
                                                    {Comment: {flags: ['required']}},
                                                    {DialogClose: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                                    {Button: {flags: ['optional', 'repeatable']}},
                                                ],
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                },
            ],
        },
    },
];

export default createComponentRules(structure, {propsScope: 'family'});
