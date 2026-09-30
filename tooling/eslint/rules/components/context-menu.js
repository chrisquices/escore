import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        ContextMenu: {
            flags: ['required'],
            children: [
                {ContextMenuTrigger: {flags: ['required', 'comment-source', 'non-empty']}},
                {BlankLine: {flags: ['required']}},
                {
                    ContextMenuContent: {
                        flags: ['required', 'unordered', 'non-empty'],
                        children: [
                            {Comment: {flags: ['required', 'text:Label']}},
                            {ContextMenuLabel: {flags: ['optional', 'repeatable', 'one-liner', 'non-empty']}},
                            {Comment: {flags: ['required']}},
                            {ContextMenuItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                            {ContextMenuCheckboxItem: {flags: ['optional', 'repeatable', 'non-empty']}},
                            {
                                ContextMenuRadioGroup: {
                                    flags: ['optional', 'repeatable'],
                                    children: [
                                        {ContextMenuRadioItem: {flags: ['required', 'repeatable', 'non-empty']}},
                                    ],
                                },
                            },
                            {Comment: {flags: ['required', 'text:Separator']}},
                            {ContextMenuSeparator: {flags: ['optional', 'repeatable', 'one-liner']}},
                            {
                                ContextMenuGroup: {
                                    flags: ['optional', 'repeatable', 'unordered', 'non-empty'],
                                    children: [
                                        {Comment: {flags: ['required', 'text:Label']}},
                                        {ContextMenuLabel: {flags: ['optional', 'repeatable', 'one-liner', 'non-empty']}},
                                        {Comment: {flags: ['required']}},
                                        {ContextMenuItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                        {ContextMenuCheckboxItem: {flags: ['optional', 'repeatable', 'non-empty']}},
                                        {
                                            ContextMenuRadioGroup: {
                                                flags: ['optional', 'repeatable'],
                                                children: [
                                                    {ContextMenuRadioItem: {flags: ['required', 'repeatable', 'non-empty']}},
                                                ],
                                            },
                                        },
                                        {Comment: {flags: ['required', 'text:Separator']}},
                                        {ContextMenuSeparator: {flags: ['optional', 'repeatable', 'one-liner']}},
                                    ],
                                },
                            },
                            {
                                ContextMenuSub: {
                                    flags: ['optional', 'repeatable'],
                                    children: [
                                        {ContextMenuSubTrigger: {flags: ['required', 'non-empty']}},
                                        {
                                            ContextMenuSubContent: {
                                                flags: ['required', 'unordered', 'non-empty'],
                                                children: [
                                                    {Comment: {flags: ['required', 'text:Label']}},
                                                    {ContextMenuLabel: {flags: ['optional', 'repeatable', 'one-liner', 'non-empty']}},
                                                    {Comment: {flags: ['required']}},
                                                    {ContextMenuItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                                    {ContextMenuCheckboxItem: {flags: ['optional', 'repeatable', 'non-empty']}},
                                                    {
                                                        ContextMenuRadioGroup: {
                                                            flags: ['optional', 'repeatable'],
                                                            children: [
                                                                {ContextMenuRadioItem: {flags: ['required', 'repeatable', 'non-empty']}},
                                                            ],
                                                        },
                                                    },
                                                    {Comment: {flags: ['required', 'text:Separator']}},
                                                    {ContextMenuSeparator: {flags: ['optional', 'repeatable', 'one-liner']}},
                                                    {
                                                        ContextMenuGroup: {
                                                            flags: ['optional', 'repeatable', 'unordered', 'non-empty'],
                                                            children: [
                                                                {Comment: {flags: ['required', 'text:Label']}},
                                                                {ContextMenuLabel: {flags: ['optional', 'repeatable', 'one-liner', 'non-empty']}},
                                                                {Comment: {flags: ['required']}},
                                                                {ContextMenuItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                                                {ContextMenuCheckboxItem: {flags: ['optional', 'repeatable', 'non-empty']}},
                                                                {
                                                                    ContextMenuRadioGroup: {
                                                                        flags: ['optional', 'repeatable'],
                                                                        children: [
                                                                            {ContextMenuRadioItem: {flags: ['required', 'repeatable', 'non-empty']}},
                                                                        ],
                                                                    },
                                                                },
                                                                {Comment: {flags: ['required', 'text:Separator']}},
                                                                {ContextMenuSeparator: {flags: ['optional', 'repeatable', 'one-liner']}},
                                                            ],
                                                        },
                                                    },
                                                    {ContextMenuSub: {flags: ['optional', 'repeatable']}},
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
    {ContextMenuShortcut: {flags: ['required', 'one-liner', 'non-empty']}},
];

export default {
    ...createComponentRules(structure),
    ...createComponentRules(shortcutStructure),
};
