import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        RadioGroup: {
            flags: ['required', 'non-empty'],
            children: [
                {Comment: {flags: ['required']}},
                {
                    Field: {
                        flags: ['required', 'repeatable'],
                        attributes: {
                            orientation: ['value:horizontal'],
                        },
                        children: [
                            {
                                RadioGroupItem: {
                                    flags: ['required', 'one-liner'],
                                    attributes: {
                                        id: ['non-empty'],
                                    },
                                },
                            },
                            {
                                FieldContent: {
                                    flags: ['required'],
                                    children: [
                                        {
                                            FieldLabel: {
                                                flags: ['required', 'comment-source', 'one-liner', 'non-empty'],
                                                attributes: {
                                                    for: ['non-empty', 'matches:RadioGroupItem.id'],
                                                },
                                            },
                                        },
                                        {FieldDescription: {flags: ['optional', 'one-liner', 'non-empty']}},
                                        {FieldError: {flags: ['optional']}},
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

export const itemStructure = [
    {RadioGroupItem: {flags: ['required', 'one-liner']}},
];

export default {
    ...createComponentRules(structure),
    ...createComponentRules(itemStructure),
};
