import createComponentRules from '../../helpers/create-component-rules.js';

// Radio items may be wrapped in fields and labels; each item keeps its own prop and line-layout checks.
export const structure = [
    {Comment: {flags: ['required']}},
    {RadioGroup: {flags: ['required', 'non-empty']}},
];

export const itemStructure = [
    {RadioGroupItem: {flags: ['required', 'one-liner']}},
];

export default {
    ...createComponentRules(structure),
    ...createComponentRules(itemStructure),
};
