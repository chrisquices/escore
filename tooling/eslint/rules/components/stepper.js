import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Stepper: {
            flags: ['required'],
            children: [
                {
                    StepperItem: {
                        flags: ['required', 'repeatable'],
                        children: [
                            {
                                StepperTrigger: {
                                    flags: ['required'],
                                    children: [
                                        {StepperIndicator: {flags: ['required', 'non-empty']}},
                                        {StepperTitle: {flags: ['optional', 'comment-source', 'one-liner', 'non-empty']}},
                                        {StepperDescription: {flags: ['optional', 'comment-source', 'one-liner', 'non-empty']}},
                                    ],
                                },
                            },
                            {StepperTitle: {flags: ['optional', 'comment-source', 'one-liner', 'non-empty']}},
                            {StepperDescription: {flags: ['optional', 'comment-source', 'one-liner', 'non-empty']}},
                            {StepperSeparator: {flags: ['optional', 'one-liner']}},
                        ],
                    },
                },
            ],
        },
    },
];

export default createComponentRules(structure);
