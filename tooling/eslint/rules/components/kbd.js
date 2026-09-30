import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {Kbd: {flags: ['required', 'comment-source', 'one-liner', 'non-empty']}},
];

export const groupStructure = [
    {
        KbdGroup: {
            flags: ['required'],
            children: [
                {Kbd: {flags: ['required', 'repeatable']}},
            ],
        },
    },
];

export default {
    ...createComponentRules(structure),
    ...createComponentRules(groupStructure, {propsScope: 'root'}),
};
