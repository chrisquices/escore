import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        DropdownMenu: {
            flags: ['required'],
            children: [
                {DropdownMenuTrigger: {flags: ['optional', 'comment-source', 'non-empty']}},
                {BlankLine: {flags: ['required']}},
                {
                    DropdownMenuContent: {
                        flags: ['required', 'unordered', 'non-empty'],
                        children: [
                            {Comment: {flags: ['required', 'text:Label']}},
                            {DropdownMenuLabel: {flags: ['optional', 'repeatable', 'one-liner', 'non-empty']}},
                            {Comment: {flags: ['required']}},
                            {DropdownMenuItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                            {DropdownMenuCheckboxItem: {flags: ['optional', 'repeatable', 'non-empty']}},
                            {
                                DropdownMenuRadioGroup: {
                                    flags: ['optional', 'repeatable'],
                                    children: [
                                        {DropdownMenuRadioItem: {flags: ['required', 'repeatable', 'non-empty']}},
                                    ],
                                },
                            },
                            {Comment: {flags: ['required', 'text:Separator']}},
                            {DropdownMenuSeparator: {flags: ['optional', 'repeatable', 'one-liner']}},
                            {
                                DropdownMenuGroup: {
                                    flags: ['optional', 'repeatable', 'unordered', 'non-empty'],
                                    children: [
                                        {Comment: {flags: ['required', 'text:Label']}},
                                        {DropdownMenuLabel: {flags: ['optional', 'repeatable', 'one-liner', 'non-empty']}},
                                        {Comment: {flags: ['required']}},
                                        {DropdownMenuItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                        {DropdownMenuCheckboxItem: {flags: ['optional', 'repeatable', 'non-empty']}},
                                        {
                                            DropdownMenuRadioGroup: {
                                                flags: ['optional', 'repeatable'],
                                                children: [
                                                    {DropdownMenuRadioItem: {flags: ['required', 'repeatable', 'non-empty']}},
                                                ],
                                            },
                                        },
                                        {Comment: {flags: ['required', 'text:Separator']}},
                                        {DropdownMenuSeparator: {flags: ['optional', 'repeatable', 'one-liner']}},
                                    ],
                                },
                            },
                            {
                                DropdownMenuSub: {
                                    flags: ['optional', 'repeatable'],
                                    children: [
                                        {DropdownMenuSubTrigger: {flags: ['required', 'non-empty']}},
                                        {
                                            DropdownMenuSubContent: {
                                                flags: ['required', 'unordered', 'non-empty'],
                                                children: [
                                                    {Comment: {flags: ['required', 'text:Label']}},
                                                    {DropdownMenuLabel: {flags: ['optional', 'repeatable', 'one-liner', 'non-empty']}},
                                                    {Comment: {flags: ['required']}},
                                                    {DropdownMenuItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                                    {DropdownMenuCheckboxItem: {flags: ['optional', 'repeatable', 'non-empty']}},
                                                    {
                                                        DropdownMenuRadioGroup: {
                                                            flags: ['optional', 'repeatable'],
                                                            children: [
                                                                {DropdownMenuRadioItem: {flags: ['required', 'repeatable', 'non-empty']}},
                                                            ],
                                                        },
                                                    },
                                                    {Comment: {flags: ['required', 'text:Separator']}},
                                                    {DropdownMenuSeparator: {flags: ['optional', 'repeatable', 'one-liner']}},
                                                    {
                                                        DropdownMenuGroup: {
                                                            flags: ['optional', 'repeatable', 'unordered', 'non-empty'],
                                                            children: [
                                                                {Comment: {flags: ['required', 'text:Label']}},
                                                                {DropdownMenuLabel: {flags: ['optional', 'repeatable', 'one-liner', 'non-empty']}},
                                                                {Comment: {flags: ['required']}},
                                                                {DropdownMenuItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                                                {DropdownMenuCheckboxItem: {flags: ['optional', 'repeatable', 'non-empty']}},
                                                                {
                                                                    DropdownMenuRadioGroup: {
                                                                        flags: ['optional', 'repeatable'],
                                                                        children: [
                                                                            {DropdownMenuRadioItem: {flags: ['required', 'repeatable', 'non-empty']}},
                                                                        ],
                                                                    },
                                                                },
                                                                {Comment: {flags: ['required', 'text:Separator']}},
                                                                {DropdownMenuSeparator: {flags: ['optional', 'repeatable', 'one-liner']}},
                                                            ],
                                                        },
                                                    },
                                                    {DropdownMenuSub: {flags: ['optional', 'repeatable']}},
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
    {DropdownMenuShortcut: {flags: ['required', 'one-liner', 'non-empty']}},
];

export default {
    ...createComponentRules(structure),
    ...createComponentRules(shortcutStructure),
};
