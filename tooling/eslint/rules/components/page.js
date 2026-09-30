import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Page: {
            flags: ['required'],
            children: [
                {Comment: {flags: ['required']}},
                {
                    PageSection: {
                        flags: ['required', 'repeatable'],
                        children: [
                            {
                                PageSectionHeading: {
                                    flags: ['optional'],
                                    children: [
                                        {PageSectionHeadingTitle: {flags: ['required', 'comment-source', 'one-liner', 'non-empty']}},
                                        {PageSectionHeadingActions: {flags: ['optional', 'non-empty']}},
                                    ],
                                },
                            },
                            {BlankLine: {flags: ['required']}},
                            {PageSectionContent: {flags: ['required', 'non-empty']}},
                        ],
                    },
                },
            ],
        },
    },
];

export default createComponentRules(structure);
