import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    // Calendar renders its own header and grid; callers can customize its named slots.
    {Calendar: {flags: ['required']}},
];

export default createComponentRules(structure);
