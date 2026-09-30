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
                        flags: ['required', 'unordered', 'non-empty'],
                        children: [
                            {SelectLabel: {flags: ['optional', 'one-liner', 'non-empty']}},
                            {Comment: {flags: ['required']}},
                            {SelectItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                            {Comment: {flags: ['required', 'text:Separator']}},
                            {SelectSeparator: {flags: ['optional', 'repeatable', 'one-liner']}},
                            {
                                SelectGroup: {
                                    flags: ['optional', 'repeatable'],
                                    children: [
                                        {SelectLabel: {flags: ['optional', 'one-liner', 'non-empty']}},
                                        {Comment: {flags: ['required']}},
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
