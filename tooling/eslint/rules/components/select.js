import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Select: {
            flags: ['required'],
            children: [
                {
                    SelectTrigger: {
                        flags: ['required'],
                        children: [
                            {SelectValue: {flags: ['required', 'one-liner']}},
                        ],
                    },
                },
                {BlankLine: {flags: ['required']}},
                {
                    SelectContent: {
                        flags: ['required', 'unordered', 'non-empty', 'blank-line-between-children'],
                        children: [
                            {SelectLabel: {flags: ['optional', 'one-liner', 'non-empty']}},
                            {SelectItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                            {Comment: {flags: ['required', 'text:Separator']}},
                            {SelectSeparator: {flags: ['optional', 'repeatable', 'one-liner']}},
                            {BlankLine: {flags: ['required']}},
                            {
                                SelectGroup: {
                                    flags: ['optional', 'repeatable', 'no-blank-line-between-children', 'no-direct-child-comments'],
                                    children: [
                                        {SelectLabel: {flags: ['optional', 'one-liner', 'non-empty']}},
                                        {SelectItem: {flags: ['required', 'repeatable', 'comment-source', 'non-empty']}},
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

export default createComponentRules(structure);
