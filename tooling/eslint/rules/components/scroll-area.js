import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {ScrollArea: {flags: ['required', 'non-empty']}},
];

export default createComponentRules(structure);
