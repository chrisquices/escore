import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Drawer: {
            flags: ['required'],
            children: [
                {DrawerTrigger: {flags: ['forbidden']}},
                {
                    DrawerContent: {
                        flags: ['required'],
                        children: [
                            {
                                DrawerHeader: {
                                    flags: ['required'],
                                    children: [
                                        {DrawerTitle: {flags: ['required', 'comment-source', 'one-liner', 'non-empty']}},
                                        {DrawerDescription: {flags: ['optional', 'comment-source', 'one-liner', 'non-empty']}},
                                    ],
                                },
                            },
                            {BlankLine: {flags: ['required']}},
                            {Form: {flags: ['optional', 'non-empty']}},
                            {div: {flags: ['optional', 'repeatable']}},
                            {BlankLine: {flags: ['required']}},
                            {
                                DrawerFooter: {
                                    flags: ['optional', 'unordered', 'blank-line-between-children'],
                                    children: [
                                        {Comment: {flags: ['required']}},
                                        {DrawerClose: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
                                        {Button: {flags: ['optional', 'repeatable']}},
                                    ],
                                },
                            },
                        ],
                    },
                },
            ],
        },
    },
];

export default createComponentRules(structure, {
    propsScope: 'family',
    forbiddenMessage: 'Do not use <{{ element }}>. Control <{{ root }}> with v-model:open or :open and @update:open; keep the opener outside <{{ root }}> and preserve its behavior.',
});
