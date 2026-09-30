import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Sidebar: {
            flags: ['required'],
            children: [
                {SidebarHeader: {flags: ['optional']}},
                {SidebarContent: {flags: ['required', 'non-empty']}},
                {SidebarFooter: {flags: ['optional']}},
                {SidebarRail: {flags: ['optional', 'one-liner']}},
            ],
        },
    },
];

export const providerStructure = [
    {SidebarProvider: {flags: ['required', 'non-empty']}},
];

export const insetStructure = [
    {SidebarInset: {flags: ['required', 'non-empty']}},
];

export const triggerStructure = [
    {SidebarTrigger: {flags: ['required', 'one-liner']}},
];

export const inputStructure = [
    {SidebarInput: {flags: ['required', 'one-liner']}},
];

export const groupStructure = [
    {Comment: {flags: ['required']}},
    {
        SidebarGroup: {
            flags: ['required'],
            children: [
                {SidebarGroupLabel: {flags: ['optional', 'comment-source', 'one-liner', 'non-empty']}},
                {SidebarGroupAction: {flags: ['optional', 'non-empty']}},
                {SidebarGroupContent: {flags: ['required', 'non-empty']}},
            ],
        },
    },
];

export const menuStructure = [
    {
        SidebarMenu: {
            flags: ['required'],
            children: [
                {
                    SidebarMenuItem: {
                        flags: ['required', 'repeatable'],
                        children: [
                            {
                                Group: {
                                    flags: ['required', 'one-of'],
                                    children: [
                                        {SidebarMenuButton: {flags: ['required', 'non-empty']}},
                                        {SidebarMenuSkeleton: {flags: ['required', 'one-liner']}},
                                    ],
                                },
                            },
                            {SidebarMenuAction: {flags: ['optional', 'non-empty']}},
                            {SidebarMenuBadge: {flags: ['optional', 'one-liner', 'non-empty']}},
                            {
                                SidebarMenuSub: {
                                    flags: ['optional'],
                                    children: [
                                        {
                                            SidebarMenuSubItem: {
                                                flags: ['required', 'repeatable'],
                                                children: [
                                                    {SidebarMenuSubButton: {flags: ['required', 'non-empty']}},
                                                ],
                                            },
                                        },
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

export default {
    ...createComponentRules(structure),
    ...createComponentRules(providerStructure),
    ...createComponentRules(insetStructure),
    ...createComponentRules(triggerStructure),
    ...createComponentRules(inputStructure),
    ...createComponentRules(groupStructure),
    ...createComponentRules(menuStructure),
};
