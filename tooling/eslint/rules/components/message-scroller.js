import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        MessageScroller: {
            flags: ['required'],
            children: [
                {
                    MessageScrollerViewport: {
                        flags: ['required'],
                        children: [
                            {
                                MessageScrollerContent: {
                                    flags: ['required'],
                                    children: [
                                        {MessageScrollerItem: {flags: ['required', 'repeatable', 'non-empty']}},
                                    ],
                                },
                            },
                        ],
                    },
                },
                {BlankLine: {flags: ['required']}},
                {MessageScrollerButton: {flags: ['optional', 'repeatable', 'one-liner']}},
            ],
        },
    },
];

export const providerStructure = [
    {MessageScrollerProvider: {flags: ['required', 'non-empty']}},
];

export default {
    ...createComponentRules(structure),
    ...createComponentRules(providerStructure),
};
