import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Stepper: {
            flags: ['required', 'blank-line-between-children'],
            children: [
                {
                    StepperItem: {
                        flags: ['required', 'repeatable', 'blank-line-between-children'],
                        children: [
                            {
                                StepperTrigger: {
                                    flags: ['required'],
                                    children: [
                                        {StepperIndicator: {flags: ['required', 'non-empty', 'one-liner']}},
                                        {StepperTitle: {flags: ['optional', 'comment-source', 'one-liner', 'non-empty']}},
                                        {StepperDescription: {flags: ['optional', 'comment-source', 'one-liner', 'non-empty']}},
                                    ],
                                },
                            },
                            {StepperTitle: {flags: ['optional', 'comment-source', 'one-liner', 'non-empty']}},
                            {StepperDescription: {flags: ['optional', 'comment-source', 'one-liner', 'non-empty']}},
                            {BlankLine: {flags: ['required']}},
                            {Comment: {flags: ['required', 'text:Separator']}},
                            {StepperSeparator: {flags: ['optional', 'one-liner']}},
                        ],
                    },
                },
            ],
        },
    },
];

export default createComponentRules(structure);
