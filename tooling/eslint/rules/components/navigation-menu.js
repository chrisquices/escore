import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        NavigationMenu: {
            flags: ['required'],
            children: [
                {
                    NavigationMenuList: {
                        flags: ['required'],
                        children: [
                            {NavigationMenuItem: {flags: ['required', 'repeatable', 'non-empty']}},
                            {NavigationMenuIndicator: {flags: ['optional', 'one-liner']}},
                        ],
                    },
                },
                {NavigationMenuViewport: {flags: ['optional', 'one-liner']}},
            ],
        },
    },
];

export const itemStructure = [
    {
        NavigationMenuItem: {
            flags: ['required', 'non-empty'],
            children: [
                {NavigationMenuTrigger: {flags: ['optional', 'comment-source', 'non-empty']}},
                {NavigationMenuLink: {flags: ['optional', 'comment-source', 'non-empty']}},
                {NavigationMenuContent: {flags: ['optional', 'non-empty']}},
            ],
        },
    },
];

export default {
    ...createComponentRules(structure),
    ...createComponentRules(itemStructure, {propsScope: 'root'}),
};
