import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        AlertDialog: {
            flags: ['required', 'top-level', 'last-in-template'],
            children: [
                {AlertDialogTrigger: {flags: ['forbidden']}},
                {
                    AlertDialogContent: {
                        flags: ['required'],
                        children: [
                            {
                                AlertDialogHeader: {
                                    flags: ['required'],
                                    children: [
                                        {AlertDialogIcon: {flags: ['optional']}},
                                        {AlertDialogTitle: {flags: ['required', 'comment-source', 'one-liner']}},
                                        {AlertDialogDescription: {flags: ['required', 'comment-source', 'one-liner']}},
                                    ],
                                },
                            },
                            {BlankLine: {flags: ['required']}},
                            {
                                AlertDialogFooter: {
                                    flags: ['required'],
                                    children: [
                                        {Comment: {flags: ['required']}},
                                        {AlertDialogCancel: {flags: ['required', 'comment-source']}},
                                        {Comment: {flags: ['required']}},
                                        {AlertDialogAction: {flags: ['required', 'comment-source']}},
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
    forbiddenMessage: 'Do not use <{{ element }}>. Control <{{ root }}> with :open and @update:open; keep the opener outside the dialog and preserve its behavior.',
});
