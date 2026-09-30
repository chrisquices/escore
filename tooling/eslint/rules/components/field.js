import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Field: {
            flags: ['required', 'unordered', 'non-empty'],
            children: [
                {FieldLabel: {flags: ['optional', 'comment-source', 'one-liner', 'non-empty']}},
                {FieldTitle: {flags: ['optional', 'comment-source', 'one-liner', 'non-empty']}},
                {Input: {flags: ['optional']}},
                {Textarea: {flags: ['optional']}},
                {Select: {flags: ['optional']}},
                {Combobox: {flags: ['optional']}},
                {Checkbox: {flags: ['optional']}},
                {Switch: {flags: ['optional']}},
                {RadioGroup: {flags: ['optional']}},
                {Slider: {flags: ['optional']}},
                {NumberField: {flags: ['optional']}},
                {DatePicker: {flags: ['optional']}},
                {InputGroup: {flags: ['optional']}},
                {InputOTP: {flags: ['optional']}},
                {TagsInput: {flags: ['optional']}},
                {FieldDescription: {flags: ['optional', 'comment-source', 'one-liner', 'non-empty']}},
                {FieldError: {flags: ['optional']}},
                {div: {flags: ['optional', 'repeatable']}},
                {
                    FieldContent: {
                        flags: ['optional', 'unordered', 'non-empty'],
                        children: [
                            {FieldLabel: {flags: ['optional', 'comment-source', 'one-liner', 'non-empty']}},
                            {FieldTitle: {flags: ['optional', 'comment-source', 'one-liner', 'non-empty']}},
                            {Input: {flags: ['optional']}},
                            {Textarea: {flags: ['optional']}},
                            {Select: {flags: ['optional']}},
                            {Combobox: {flags: ['optional']}},
                            {Checkbox: {flags: ['optional']}},
                            {Switch: {flags: ['optional']}},
                            {RadioGroup: {flags: ['optional']}},
                            {Slider: {flags: ['optional']}},
                            {NumberField: {flags: ['optional']}},
                            {DatePicker: {flags: ['optional']}},
                            {InputGroup: {flags: ['optional']}},
                            {InputOTP: {flags: ['optional']}},
                            {TagsInput: {flags: ['optional']}},
                            {FieldDescription: {flags: ['optional', 'comment-source', 'one-liner', 'non-empty']}},
                            {FieldError: {flags: ['optional']}},
                            {div: {flags: ['optional', 'repeatable']}},
                        ],
                    },
                },
            ],
        },
    },
];

export const groupStructure = [
    {
        FieldGroup: {
            flags: ['required', 'unordered', 'non-empty'],
            children: [
                {Field: {flags: ['optional', 'repeatable']}},
                {FieldSet: {flags: ['optional', 'repeatable']}},
                {FieldSeparator: {flags: ['optional', 'repeatable', 'one-liner']}},
            ],
        },
    },
];

export const setStructure = [
    {Comment: {flags: ['required']}},
    {
        FieldSet: {
            flags: ['required'],
            children: [
                {FieldLegend: {flags: ['required', 'comment-source', 'one-liner', 'non-empty']}},
                {BlankLine: {flags: ['required']}},
                {FieldGroup: {flags: ['required']}},
            ],
        },
    },
];

export default {
    ...createComponentRules(structure, {propsScope: 'family'}),
    ...createComponentRules(groupStructure, {propsScope: 'root'}),
    ...createComponentRules(setStructure),
};
