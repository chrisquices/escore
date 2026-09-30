import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Marker: {
            flags: ['required'],
            children: [
                {MarkerIcon: {flags: ['optional']}},
                {MarkerContent: {flags: ['required', 'comment-source', 'one-liner', 'non-empty']}},
            ],
        },
    },
];

export default createComponentRules(structure);
