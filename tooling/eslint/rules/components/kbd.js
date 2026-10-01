import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Kbd: {flags: ['required', 'one-liner', 'non-empty']}},
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
