import createComponentRules from '../../helpers/create-component-rules.js';

// Command and CommandDialog share slotted input/list markup; CommandDialog creates its own Command internally.
export const structure = [
    {Comment: {flags: ['required']}},
    {Command: {flags: ['required', 'non-empty']}},
];

export const dialogStructure = [
    {Comment: {flags: ['required']}},
    {CommandDialog: {flags: ['required', 'comment-source:title', 'non-empty']}},
];

export const inputStructure = [
    {CommandInput: {flags: ['required', 'one-liner']}},
];

export const listStructure = [
    {
        CommandList: {
            flags: ['required', 'unordered', 'non-empty'],
            children: [
                {CommandEmpty: {flags: ['optional']}},
                {Comment: {flags: ['required']}},
                {CommandItem: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                {Comment: {flags: ['required', 'text:Separator']}},
                {CommandSeparator: {flags: ['optional', 'repeatable', 'one-liner']}},
                {Comment: {flags: ['required']}},
                {
                    CommandGroup: {
                        flags: ['optional', 'repeatable', 'comment-source:heading'],
                        children: [
                            {Comment: {flags: ['required']}},
                            {CommandItem: {flags: ['required', 'repeatable', 'comment-source', 'non-empty']}},
                        ],
                    },
                },
            ],
        },
    },
];

export const shortcutStructure = [
    {CommandShortcut: {flags: ['required', 'one-liner', 'non-empty']}},
];

export default {
    ...createComponentRules(structure),
    ...createComponentRules(dialogStructure),
    ...createComponentRules(inputStructure),
    ...createComponentRules(listStructure),
    ...createComponentRules(shortcutStructure),
};
