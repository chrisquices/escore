import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Sidebar: {
            flags: ['required', 'blank-line-between-children'],
            children: [
                {SidebarHeader: {flags: ['optional']}},
                {Comment: {flags: ['required', 'text:Separator']}},
                {SidebarSeparator: {flags: ['optional', 'one-liner']}},
                {Comment: {flags: ['required']}},
                {SidebarContent: {flags: ['required', 'non-empty']}},
                {Comment: {flags: ['required', 'text:Separator']}},
                {SidebarSeparator: {flags: ['optional', 'one-liner']}},
                {Comment: {flags: ['required']}},
                {SidebarFooter: {flags: ['optional']}},
                {Comment: {flags: ['required']}},
                {SidebarRail: {flags: ['optional', 'one-liner']}},
            ],
        },
    },
];

export const providerStructure = [
    {SidebarProvider: {flags: ['required', 'non-empty', 'blank-line-between-children']}},
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
            flags: ['required', 'blank-line-between-children'],
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
