import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {ScrollArea: {flags: ['required', 'non-empty']}},
];

export const barStructure = [
    {ScrollBar: {flags: ['required', 'one-liner']}},
];

export default {
    ...createComponentRules(structure),
    ...createComponentRules(barStructure),
};
