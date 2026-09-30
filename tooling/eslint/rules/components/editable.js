import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Editable: {
            flags: ['required'],
            children: [
                {
                    EditableArea: {
                        flags: ['required'],
                        children: [
                            {EditablePreview: {flags: ['required']}},
                            {EditableInput: {flags: ['required', 'one-liner']}},
                        ],
                    },
                },
                {EditableEditTrigger: {flags: ['optional', 'comment-source']}},
                {EditableSubmitTrigger: {flags: ['optional']}},
                {EditableCancelTrigger: {flags: ['optional']}},
            ],
        },
    },
];

export default createComponentRules(structure);
