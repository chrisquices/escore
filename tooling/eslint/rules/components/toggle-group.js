import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        ToggleGroup: {
            flags: ['required'],
            children: [
                {Comment: {flags: ['required']}},
                {ToggleGroupItem: {flags: ['required', 'repeatable', 'comment-source', 'non-empty']}},
            ],
        },
    },
];

export default createComponentRules(structure);
