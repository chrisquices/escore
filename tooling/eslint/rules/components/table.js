import createComponentRules from '../../helpers/create-component-rules.js';
import {matchCommentByColumn} from '../../helpers/component-comments.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Table: {
            flags: ['required', 'blank-line-between-children'],
            children: [
                {TableCaption: {flags: ['optional', 'comment-source', 'one-liner']}},
                {
                    TableHeader: {
                        flags: ['required', 'blank-line-between-children'],
                        children: [
                            {
                                TableRow: {
                                    flags: ['required', 'repeatable'],
                                    children: [
                                        {Comment: {flags: ['required']}},
                                        {TableHead: {flags: ['required', 'repeatable', 'comment-source', 'multi-liner', 'non-empty']}},
                                    ],
                                },
                            },
                        ],
                    },
                },
                {BlankLine: {flags: ['required']}},
                {
                    TableBody: {
                        flags: ['required', 'unordered', 'non-empty'],
                        children: [
                            {Comment: {flags: ['required']}},
                            {
                                TableRow: {
                                    flags: ['optional', 'repeatable'],
                                    children: [
                                        {Comment: {flags: ['required', 'comment-from:TableHead']}},
                                        {TableCell: {flags: ['required', 'repeatable', 'multi-liner']}},
                                    ],
                                },
                            },
                            {Comment: {flags: ['required']}},
                            {TableEmpty: {flags: ['optional']}},
                        ],
                    },
                },
                {BlankLine: {flags: ['required']}},
                {
                    TableFooter: {
                        flags: ['optional'],
                        children: [
                            {
                                TableRow: {
                                    flags: ['required', 'repeatable'],
                                    children: [
                                        {Comment: {flags: ['required']}},
                                        {TableCell: {flags: ['required', 'repeatable', 'multi-liner']}},
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
    commentMatchers: {TableHead: matchCommentByColumn},
});
