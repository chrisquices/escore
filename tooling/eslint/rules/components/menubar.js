import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Menubar: {
            flags: ['required'],
            children: [
                {Comment: {flags: ['required']}},
                {
                    MenubarMenu: {
                        flags: ['required', 'repeatable'],
                        children: [
                            {MenubarTrigger: {flags: ['optional', 'comment-source', 'non-empty']}},
                            {BlankLine: {flags: ['required']}},
                            {
                                MenubarContent: {
                                    flags: ['required', 'unordered', 'non-empty'],
                                    children: [
                                        {Comment: {flags: ['required', 'text:Label']}},
                                        {MenubarLabel: {flags: ['optional', 'repeatable', 'one-liner', 'non-empty']}},
                                        {Comment: {flags: ['required']}},
                                        {MenubarItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                        {MenubarCheckboxItem: {flags: ['optional', 'repeatable', 'non-empty']}},
                                        {
                                            MenubarRadioGroup: {
                                                flags: ['optional', 'repeatable'],
                                                children: [
                                                    {MenubarRadioItem: {flags: ['required', 'repeatable', 'non-empty']}},
                                                ],
                                            },
                                        },
                                        {Comment: {flags: ['required', 'text:Separator']}},
                                        {MenubarSeparator: {flags: ['optional', 'repeatable', 'one-liner']}},
                                        {
                                            MenubarGroup: {
                                                flags: ['optional', 'repeatable', 'unordered', 'non-empty'],
                                                children: [
                                                    {Comment: {flags: ['required', 'text:Label']}},
                                                    {MenubarLabel: {flags: ['optional', 'repeatable', 'one-liner', 'non-empty']}},
                                                    {Comment: {flags: ['required']}},
                                                    {MenubarItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                                    {MenubarCheckboxItem: {flags: ['optional', 'repeatable', 'non-empty']}},
                                                    {
                                                        MenubarRadioGroup: {
                                                            flags: ['optional', 'repeatable'],
                                                            children: [
                                                                {MenubarRadioItem: {flags: ['required', 'repeatable', 'non-empty']}},
                                                            ],
                                                        },
                                                    },
                                                    {Comment: {flags: ['required', 'text:Separator']}},
                                                    {MenubarSeparator: {flags: ['optional', 'repeatable', 'one-liner']}},
                                                ],
                                            },
                                        },
                                        {
                                            MenubarSub: {
                                                flags: ['optional', 'repeatable'],
                                                children: [
                                                    {MenubarSubTrigger: {flags: ['required', 'non-empty']}},
                                                    {
                                                        MenubarSubContent: {
                                                            flags: ['required', 'unordered', 'non-empty'],
                                                            children: [
                                                                {Comment: {flags: ['required', 'text:Label']}},
                                                                {MenubarLabel: {flags: ['optional', 'repeatable', 'one-liner', 'non-empty']}},
                                                                {Comment: {flags: ['required']}},
                                                                {MenubarItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                                                {MenubarCheckboxItem: {flags: ['optional', 'repeatable', 'non-empty']}},
                                                                {
                                                                    MenubarRadioGroup: {
                                                                        flags: ['optional', 'repeatable'],
                                                                        children: [
                                                                            {MenubarRadioItem: {flags: ['required', 'repeatable', 'non-empty']}},
                                                                        ],
                                                                    },
                                                                },
                                                                {Comment: {flags: ['required', 'text:Separator']}},
                                                                {MenubarSeparator: {flags: ['optional', 'repeatable', 'one-liner']}},
                                                                {
                                                                    MenubarGroup: {
                                                                        flags: ['optional', 'repeatable', 'unordered', 'non-empty'],
                                                                        children: [
                                                                            {Comment: {flags: ['required', 'text:Label']}},
                                                                            {MenubarLabel: {flags: ['optional', 'repeatable', 'one-liner', 'non-empty']}},
                                                                            {Comment: {flags: ['required']}},
                                                                            {MenubarItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                                                            {MenubarCheckboxItem: {flags: ['optional', 'repeatable', 'non-empty']}},
                                                                            {
                                                                                MenubarRadioGroup: {
                                                                                    flags: ['optional', 'repeatable'],
                                                                                    children: [
                                                                                        {MenubarRadioItem: {flags: ['required', 'repeatable', 'non-empty']}},
                                                                                    ],
                                                                                },
                                                                            },
                                                                            {Comment: {flags: ['required', 'text:Separator']}},
                                                                            {MenubarSeparator: {flags: ['optional', 'repeatable', 'one-liner']}},
                                                                        ],
                                                                    },
                                                                },
                                                                {MenubarSub: {flags: ['optional', 'repeatable']}},
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
            ],
        },
    },
];

export const shortcutStructure = [
    {MenubarShortcut: {flags: ['required', 'one-liner', 'non-empty']}},
];

export default {
    ...createComponentRules(structure),
    ...createComponentRules(shortcutStructure),
};
