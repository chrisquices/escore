import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        InputOTP: {
            flags: ['required', 'blank-line-between-children'],
            children: [
                {
                    InputOTPGroup: {
                        flags: ['required'],
                        children: [
                            {InputOTPSlot: {flags: ['required', 'repeatable', 'one-liner']}},
                        ],
                    },
                },
                {
                    Group: {
                        flags: ['optional', 'repeatable'],
                        children: [
                            {Comment: {flags: ['required', 'text:Separator']}},
                            {InputOTPSeparator: {flags: ['required', 'one-liner']}},
                            {
                                InputOTPGroup: {
                                    flags: ['required'],
                                    children: [
                                        {InputOTPSlot: {flags: ['required', 'repeatable', 'one-liner']}},
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

export default createComponentRules(structure);
