import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Tooltip: {
            flags: ['required'],
            children: [
                {TooltipTrigger: {flags: ['required', 'non-empty']}},
                {BlankLine: {flags: ['required']}},
                {TooltipContent: {flags: ['required', 'comment-source', 'non-empty']}},
            ],
        },
    },
];

export const providerStructure = [
    {TooltipProvider: {flags: ['required', 'non-empty']}},
];

export default {
    ...createComponentRules(structure),
    ...createComponentRules(providerStructure),
};
