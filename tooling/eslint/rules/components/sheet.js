import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Sheet: {
            flags: ['required', 'top-level', 'last-in-template'],
            children: [
                {SheetTrigger: {flags: ['forbidden']}},
                {SheetOverlay: {flags: ['optional', 'one-liner']}},
                {
                    SheetContent: {
                        flags: ['required'],
                        children: [
                            {
                                SheetHeader: {
                                    flags: ['required'],
                                    children: [
                                        {SheetTitle: {flags: ['required', 'comment-source', 'one-liner', 'non-empty']}},
                                        {SheetDescription: {flags: ['optional', 'comment-source', 'one-liner', 'non-empty']}},
                                    ],
                                },
                            },
                            {BlankLine: {flags: ['required']}},
                            {Form: {flags: ['optional', 'non-empty']}},
                            {div: {flags: ['optional', 'repeatable']}},
                            {BlankLine: {flags: ['required']}},
                            {
                                SheetFooter: {
                                    flags: ['optional', 'unordered'],
                                    children: [
                                        {Comment: {flags: ['required']}},
                                        {SheetClose: {flags: ['optional', 'repeatable', 'comment-source', 'non-empty']}},
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
