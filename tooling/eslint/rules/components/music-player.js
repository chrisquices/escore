import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {MusicPlayer: {flags: ['required', 'multi-liner-attributes']}},
];

export default createComponentRules(structure);
