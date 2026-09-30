import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        NumberField: {
            flags: ['required'],
            children: [
                {Label: {flags: ['optional']}},
                {
                    NumberFieldContent: {
                        flags: ['required'],
                        children: [
                            {NumberFieldDecrement: {flags: ['optional', 'one-liner']}},
                            {NumberFieldInput: {flags: ['required', 'one-liner']}},
                            {NumberFieldIncrement: {flags: ['optional', 'one-liner']}},
                        ],
                    },
                },
            ],
        },
    },
];

export default createComponentRules(structure, {propsScope: 'family'});
