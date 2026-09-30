import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Combobox: {
            flags: ['required'],
            children: [
                {
                    ComboboxAnchor: {
                        flags: ['required', 'unordered', 'non-empty'],
                        children: [
                            {ComboboxInput: {flags: ['optional', 'one-liner']}},
                            {ComboboxTrigger: {flags: ['optional', 'comment-source', 'non-empty']}},
                        ],
                    },
                },
                {BlankLine: {flags: ['required']}},
                {
                    ComboboxList: {
                        flags: ['required', 'unordered', 'non-empty'],
                        children: [
                            {ComboboxInput: {flags: ['optional', 'one-liner']}},
                            {
                                ComboboxViewport: {
                                    flags: ['optional', 'unordered', 'non-empty'],
                                    children: [
                                        {ComboboxEmpty: {flags: ['optional', 'one-liner']}},
                                        {Comment: {flags: ['required']}},
                                        {ComboboxItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                        {Comment: {flags: ['required', 'text:Separator']}},
                                        {ComboboxSeparator: {flags: ['optional', 'repeatable', 'one-liner']}},
                                        {
                                            ComboboxGroup: {
                                                flags: ['optional', 'repeatable'],
                                                children: [
                                                    {Comment: {flags: ['required']}},
                                                    {ComboboxItem: {flags: ['required', 'repeatable', 'comment-source', 'non-empty']}},
                                                ],
                                            },
                                        },
                                    ],
                                },
                            },
                            {ComboboxEmpty: {flags: ['optional', 'one-liner']}},
                            {Comment: {flags: ['required']}},
                            {ComboboxItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                            {Comment: {flags: ['required', 'text:Separator']}},
                            {ComboboxSeparator: {flags: ['optional', 'repeatable', 'one-liner']}},
                            {
                                ComboboxGroup: {
                                    flags: ['optional', 'repeatable'],
                                    children: [
                                        {Comment: {flags: ['required']}},
                                        {ComboboxItem: {flags: ['required', 'repeatable', 'comment-source', 'non-empty']}},
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

export const indicatorStructure = [
    {ComboboxItemIndicator: {flags: ['required']}},
];

export default {
    ...createComponentRules(structure),
    ...createComponentRules(indicatorStructure),
};
