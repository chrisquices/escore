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
                        flags: ['required', 'unordered', 'non-empty', 'blank-line-between-children'],
                        children: [
                            {Comment: {flags: ['required', 'text:Label']}},
                            {ContextMenuLabel: {flags: ['optional', 'repeatable', 'one-liner', 'non-empty']}},
                            {Comment: {flags: ['required']}},
                            {ContextMenuItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                            {Comment: {flags: ['required']}},
                            {ContextMenuCheckboxItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                            {Comment: {flags: ['required']}},
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
                            {BlankLine: {flags: ['required']}},
                            {
                                ContextMenuGroup: {
                                    flags: ['optional', 'repeatable', 'unordered', 'non-empty'],
                                    children: [
                                        {Comment: {flags: ['required', 'text:Label']}},
                                        {ContextMenuLabel: {flags: ['optional', 'repeatable', 'one-liner', 'non-empty']}},
                                        {Comment: {flags: ['required']}},
                                        {ContextMenuItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                        {Comment: {flags: ['required']}},
                                        {ContextMenuCheckboxItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                        {Comment: {flags: ['required']}},
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
                            {Comment: {flags: ['required']}},
                            {
                                ContextMenuSub: {
                                    flags: ['optional', 'repeatable'],
                                    children: [
                                        {ContextMenuSubTrigger: {flags: ['required', 'comment-source', 'non-empty']}},
                                        {
                                            ContextMenuSubContent: {
                                                flags: ['required', 'unordered', 'non-empty'],
                                                children: [
                                                    {Comment: {flags: ['required', 'text:Label']}},
                                                    {ContextMenuLabel: {flags: ['optional', 'repeatable', 'one-liner', 'non-empty']}},
                                                    {Comment: {flags: ['required']}},
                                                    {ContextMenuItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                                    {Comment: {flags: ['required']}},
                                                    {ContextMenuCheckboxItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                                    {Comment: {flags: ['required']}},
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
                                                    {BlankLine: {flags: ['required']}},
                                                    {
                                                        ContextMenuGroup: {
                                                            flags: ['optional', 'repeatable', 'unordered', 'non-empty'],
                                                            children: [
                                                                {Comment: {flags: ['required', 'text:Label']}},
                                                                {ContextMenuLabel: {flags: ['optional', 'repeatable', 'one-liner', 'non-empty']}},
                                                                {Comment: {flags: ['required']}},
                                                                {ContextMenuItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                                                {Comment: {flags: ['required']}},
                                                                {ContextMenuCheckboxItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                                                {Comment: {flags: ['required']}},
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
                                                    {Comment: {flags: ['required']}},
                                                    {
                                                        ContextMenuSub: {
                                                            flags: ['optional', 'repeatable'],
                                                            children: [
                                                                {ContextMenuSubTrigger: {flags: ['required', 'comment-source', 'non-empty']}},
                                                                {ContextMenuSubContent: {flags: ['required', 'non-empty']}},
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
    {ContextMenuShortcut: {flags: ['required', 'one-liner', 'non-empty']}},
];

export default {
    ...createComponentRules(structure),
    ...createComponentRules(shortcutStructure),
};
