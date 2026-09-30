import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Collapsible: {
            flags: ['required'],
            children: [
                {CollapsibleTrigger: {flags: ['optional', 'comment-source', 'non-empty']}},
                {BlankLine: {flags: ['required']}},
                {CollapsibleContent: {flags: ['required', 'non-empty']}},
            ],
        },
    },
];

export default createComponentRules(structure);
