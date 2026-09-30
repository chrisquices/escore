import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        TagsInput: {
            flags: ['required'],
            children: [
                {
                    TagsInputItem: {
                        flags: ['optional', 'repeatable'],
                        children: [
                            {TagsInputItemText: {flags: ['required', 'one-liner']}},
                            {TagsInputItemDelete: {flags: ['optional', 'one-liner']}},
                        ],
                    },
                },
                {TagsInputInput: {flags: ['required', 'one-liner']}},
            ],
        },
    },
];

export default createComponentRules(structure);
