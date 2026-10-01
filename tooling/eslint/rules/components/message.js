import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Message: {
            flags: ['required'],
            children: [
                {MessageAvatar: {flags: ['optional']}},
                {
                    MessageContent: {
                        flags: ['required'],
                        children: [
                            {MessageHeader: {flags: ['optional', 'comment-source', 'one-liner']}},
                            {Bubble: {flags: ['optional', 'repeatable']}},
                            {BubbleGroup: {flags: ['optional']}},
                            {MessageFooter: {flags: ['optional', 'one-liner']}},
                        ],
                    },
                },
            ],
        },
    },
];

export const groupStructure = [
    {
        MessageGroup: {
            flags: ['required'],
            children: [
                {Message: {flags: ['required', 'repeatable']}},
            ],
        },
    },
];

export default {
    ...createComponentRules(structure, {propsScope: 'family'}),
    ...createComponentRules(groupStructure, {propsScope: 'root'}),
};
