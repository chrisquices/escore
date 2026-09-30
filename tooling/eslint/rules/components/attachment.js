import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Attachment: {
            flags: ['required'],
            children: [
                {AttachmentTrigger: {flags: ['optional']}},
                {AttachmentMedia: {flags: ['optional']}},
                {BlankLine: {flags: ['required']}},
                {
                    AttachmentContent: {
                        flags: ['required'],
                        children: [
                            {AttachmentTitle: {flags: ['required', 'comment-source', 'one-liner']}},
                            {AttachmentDescription: {flags: ['optional', 'comment-source', 'one-liner']}},
                        ],
                    },
                },
                {BlankLine: {flags: ['required']}},
                {
                    AttachmentActions: {
                        flags: ['optional'],
                        children: [
                            {Comment: {flags: ['required']}},
                            {AttachmentAction: {flags: ['required', 'repeatable', 'comment-source']}},
                        ],
                    },
                },
            ],
        },
    },
];

export const groupStructure = [
    {
        AttachmentGroup: {
            flags: ['required'],
            children: [
                {Attachment: {flags: ['required', 'repeatable']}},
            ],
        },
    },
];

// The group checks membership; each Attachment's own rules check its props and contents.
const groupRules = createComponentRules(groupStructure);

export default {
    ...createComponentRules(structure),
    'attachmentgroup-must-follow-structure': groupRules['attachmentgroup-must-follow-structure'],
};
