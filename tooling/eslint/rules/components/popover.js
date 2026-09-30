import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Popover: {
            flags: ['required'],
            children: [
                {PopoverAnchor: {flags: ['optional', 'non-empty']}},
                {PopoverTrigger: {flags: ['optional', 'comment-source', 'non-empty']}},
                {BlankLine: {flags: ['required']}},
                {PopoverContent: {flags: ['required', 'non-empty']}},
            ],
        },
    },
];

export const headerStructure = [
    {
        PopoverHeader: {
            flags: ['required'],
            children: [
                {PopoverTitle: {flags: ['required', 'one-liner', 'non-empty']}},
                {PopoverDescription: {flags: ['optional', 'one-liner', 'non-empty']}},
                {PopoverAction: {flags: ['optional', 'non-empty']}},
            ],
        },
    },
];

export default {
    ...createComponentRules(structure),
    ...createComponentRules(headerStructure),
};
