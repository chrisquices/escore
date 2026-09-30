import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        NativeSelect: {
            flags: ['required', 'unordered', 'non-empty'],
            children: [
                {NativeSelectOption: {flags: ['optional', 'repeatable', 'one-liner']}},
                {
                    NativeSelectOptGroup: {
                        flags: ['optional', 'repeatable'],
                        children: [
                            {NativeSelectOption: {flags: ['required', 'repeatable', 'one-liner']}},
                        ],
                    },
                },
            ],
        },
    },
];

export default createComponentRules(structure);
