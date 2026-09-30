import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Pagination: {
            flags: ['required'],
            children: [
                {
                    PaginationContent: {
                        flags: ['required', 'unordered'],
                        children: [
                            {PaginationFirst: {flags: ['optional', 'one-liner']}},
                            {PaginationPrevious: {flags: ['optional', 'one-liner']}},
                            {PaginationItem: {flags: ['required', 'repeatable', 'non-empty']}},
                            {PaginationEllipsis: {flags: ['optional', 'repeatable', 'one-liner']}},
                            {PaginationNext: {flags: ['optional', 'one-liner']}},
                            {PaginationLast: {flags: ['optional', 'one-liner']}},
                        ],
                    },
                },
            ],
        },
    },
];

export default createComponentRules(structure);
