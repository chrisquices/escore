import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        InputGroup: {
            flags: ['required'],
            children: [
                {InputGroupAddon: {flags: ['optional', 'repeatable']}},
                {
                    Group: {
                        flags: ['required', 'one-of'],
                        children: [
                            {InputGroupInput: {flags: ['required', 'one-liner']}},
                            {InputGroupTextarea: {flags: ['required', 'one-liner']}},
                        ],
                    },
                },
                {InputGroupAddon: {flags: ['optional', 'repeatable']}},
            ],
        },
    },
];

export const buttonStructure = [
    {Comment: {flags: ['required']}},
    {InputGroupButton: {flags: ['required', 'comment-source', 'multi-liner', 'non-empty']}},
];

export const textStructure = [
    {InputGroupText: {flags: ['required', 'one-liner', 'non-empty']}},
];

export default {
    ...createComponentRules(structure),
    ...createComponentRules(buttonStructure),
    ...createComponentRules(textStructure),
};
