import enforceElementChildren from '../../helpers/enforce-element-children.js';
import requireElementChild from '../../helpers/require-element-child.js';
import enforceBlankLine from '../../helpers/enforce-blank-line.js';

export const structure = {
    Comment: {meta: ['required']},
    Empty: {
        meta: ['required'],
        EmptyHeader: {
            meta: ['required'],
            EmptyMedia: {meta: ['optional']},
            EmptyTitle: {meta: ['required', 'comment-source']},
            EmptyDescription: {meta: ['required']},
        },

        BlankLine: {meta: ['required']},

        EmptyContent: {
            meta: ['optional'],
            Button: {meta: ['required']},
        },
    },
};

export default {
    // Structure: report invalid direct children without requiring their existence.


    'enforce-children-empty': enforceElementChildren({structure, element: 'Empty'}),

    'enforce-children-emptyheader': enforceElementChildren({structure, element: 'EmptyHeader'}),

    'enforce-children-emptycontent': enforceElementChildren({structure, element: 'EmptyContent'}),

    // Existence: report missing required children independently of structure.
    'require-empty-to-directly-have-emptyheader': requireElementChild({
        structure,
        parent: 'Empty',
        child: 'EmptyHeader',
    }),

    'require-emptyheader-to-directly-have-emptytitle': requireElementChild({
        structure,
        parent: 'EmptyHeader',
        child: 'EmptyTitle',
    }),

    'require-emptyheader-to-directly-have-emptydescription': requireElementChild({
        structure,
        parent: 'EmptyHeader',
        child: 'EmptyDescription',
    }),

    // Spacing: fix whitespace while preserving attached comments.
    'enforce-blank-line-above-emptycontent': enforceBlankLine({
        structure,
        elements: ['EmptyContent'],
        position: structure.elements.EmptyContent.blankLine,
    }),
};
