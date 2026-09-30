import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        DropdownMenu: {
            flags: ['required'],
            children: [
                {DropdownMenuTrigger: {flags: ['required', 'comment-source', 'non-empty']}},
                {BlankLine: {flags: ['required']}},
                {
                    DropdownMenuContent: {
                        flags: ['required', 'unordered', 'non-empty', 'blank-line-between-children'],
                        children: [
                            {Comment: {flags: ['required', 'text:Label']}},
                            {DropdownMenuLabel: {flags: ['optional', 'repeatable', 'one-liner', 'non-empty']}},
                            {Comment: {flags: ['required']}},
                            {DropdownMenuItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                            {Comment: {flags: ['required']}},
                            {DropdownMenuCheckboxItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                            {Comment: {flags: ['required']}},
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
                            {BlankLine: {flags: ['required']}},
                            {
                                DropdownMenuGroup: {
                                    flags: ['optional', 'repeatable', 'unordered', 'non-empty'],
                                    children: [
                                        {Comment: {flags: ['required', 'text:Label']}},
                                        {DropdownMenuLabel: {flags: ['optional', 'repeatable', 'one-liner', 'non-empty']}},
                                        {Comment: {flags: ['required']}},
                                        {DropdownMenuItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                        {Comment: {flags: ['required']}},
                                        {DropdownMenuCheckboxItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                        {Comment: {flags: ['required']}},
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
                            {Comment: {flags: ['required']}},
                            {
                                DropdownMenuSub: {
                                    flags: ['optional', 'repeatable'],
                                    children: [
                                        {DropdownMenuSubTrigger: {flags: ['required', 'comment-source', 'non-empty']}},
                                        {
                                            DropdownMenuSubContent: {
                                                flags: ['required', 'unordered', 'non-empty'],
                                                children: [
                                                    {Comment: {flags: ['required', 'text:Label']}},
                                                    {DropdownMenuLabel: {flags: ['optional', 'repeatable', 'one-liner', 'non-empty']}},
                                                    {Comment: {flags: ['required']}},
                                                    {DropdownMenuItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                                    {Comment: {flags: ['required']}},
                                                    {DropdownMenuCheckboxItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                                    {Comment: {flags: ['required']}},
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
                                                    {BlankLine: {flags: ['required']}},
                                                    {
                                                        DropdownMenuGroup: {
                                                            flags: ['optional', 'repeatable', 'unordered', 'non-empty'],
                                                            children: [
                                                                {Comment: {flags: ['required', 'text:Label']}},
                                                                {DropdownMenuLabel: {flags: ['optional', 'repeatable', 'one-liner', 'non-empty']}},
                                                                {Comment: {flags: ['required']}},
                                                                {DropdownMenuItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                                                {Comment: {flags: ['required']}},
                                                                {DropdownMenuCheckboxItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                                                {Comment: {flags: ['required']}},
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
                                                    {Comment: {flags: ['required']}},
                                                    {
                                                        DropdownMenuSub: {
                                                            flags: ['optional', 'repeatable'],
                                                            children: [
                                                                {DropdownMenuSubTrigger: {flags: ['required', 'comment-source', 'non-empty']}},
                                                                {DropdownMenuSubContent: {flags: ['required', 'non-empty']}},
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
    {DropdownMenuShortcut: {flags: ['required', 'one-liner', 'non-empty']}},
];

export default {
    ...createComponentRules(structure),
    ...createComponentRules(shortcutStructure),
};
