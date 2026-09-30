import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Breadcrumb: {
            flags: ['required'],
            children: [
                {
                    BreadcrumbList: {
                        flags: ['required'],
                        children: [
                            {
                                Group: {
                                    flags: ['optional', 'repeatable'],
                                    children: [
                                        {Comment: {flags: ['required']}},
                                        {
                                            BreadcrumbItem: {
                                                flags: ['required', 'multi-liner'],
                                                children: [
                                                    {
                                                        Group: {
                                                            flags: ['required', 'one-of'],
                                                            children: [
                                                                {BreadcrumbLink: {flags: ['required', 'comment-source', 'one-liner']}},
                                                                {BreadcrumbEllipsis: {flags: ['required', 'one-liner']}},
                                                            ],
                                                        },
                                                    },
                                                ],
                                            },
                                        },
                                        {Comment: {flags: ['required', 'text:Separator']}},
                                        {BreadcrumbSeparator: {flags: ['required', 'one-liner']}},
                                    ],
                                },
                            },
                            {Comment: {flags: ['required']}},
                            {
                                BreadcrumbItem: {
                                    flags: ['required'],
                                    children: [
                                        {BreadcrumbPage: {flags: ['required', 'comment-source', 'one-liner']}},
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

export default createComponentRules(structure);
