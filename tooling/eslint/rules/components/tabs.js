import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Tabs: {
            flags: ['required', 'blank-line-between-children'],
            children: [
                {
                    TabsList: {
                        flags: ['required'],
                        children: [
                            {TabsTrigger: {flags: ['required', 'repeatable', 'comment-source', 'one-liner', 'non-empty']}},
                        ],
                    },
                },
                {BlankLine: {flags: ['required']}},
                {Comment: {flags: ['required']}},
                {TabsContent: {flags: ['required', 'repeatable', 'non-empty']}},
            ],
        },
    },
];

export default createComponentRules(structure);
