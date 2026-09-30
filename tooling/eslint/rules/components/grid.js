import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Grid: {
            flags: ['required'],
            children: [
                {Comment: {flags: ['required']}},
                {
                    GridItem: {
                        flags: ['required', 'repeatable'],
                        children: [
                            {GridItemContent: {flags: ['required', 'non-empty']}},
                            {GridItemOverlay: {flags: ['optional']}},
                            {GridItemLabel: {flags: ['optional', 'comment-source', 'comment-source:name', 'one-liner']}},
                        ],
                    },
                },
            ],
        },
    },
];

export default createComponentRules(structure);
