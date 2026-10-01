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
    {TooltipProvider: {flags: ['required', 'non-empty', 'once-per-file']}},
];

export default {
    ...createComponentRules(structure),
    ...createComponentRules(providerStructure, {
        oncePerFileMessage: 'Use <{{ element }}> only once per file. Multiple providers create separate tooltip contexts. Consolidate them into one provider, ideally in a top-level shell or layout.',
    }),
};
