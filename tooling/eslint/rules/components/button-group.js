import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        ButtonGroup: {
            flags: ['required', 'non-empty', 'unordered'],
            children: [
                {Button: {flags: ['optional', 'repeatable']}},
                {Comment: {flags: ['required']}},
                {ButtonGroupText: {flags: ['optional', 'repeatable', 'one-liner', 'non-empty', 'comment-source']}},
                {Comment: {flags: ['required', 'text:Separator']}},
                {ButtonGroupSeparator: {flags: ['optional', 'repeatable', 'one-liner']}},
                {Input: {flags: ['optional', 'repeatable']}},
                {Select: {flags: ['optional', 'repeatable']}},
                {DropdownMenu: {flags: ['optional', 'repeatable']}},
                {ButtonGroup: {flags: ['optional', 'repeatable']}},
            ],
        },
    },
];

export default createComponentRules(structure, {propsScope: 'family'});
