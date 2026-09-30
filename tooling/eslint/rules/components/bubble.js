import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {
        Bubble: {
            flags: ['required'],
            children: [
                {BubbleContent: {flags: ['required', 'comment-source']}},
                {BlankLine: {flags: ['required']}},
                {BubbleReactions: {flags: ['optional']}},
            ],
        },
    },
];

export const groupStructure = [
    {Comment: {flags: ['required']}},
    {
        BubbleGroup: {
            flags: ['required'],
            children: [
                {Bubble: {flags: ['required', 'repeatable']}},
            ],
        },
    },
];

export default {
    ...createComponentRules(structure),
    // Each Bubble validates its own contents and props, including when grouped.
    ...createComponentRules(groupStructure, {propsScope: 'root'}),
};
