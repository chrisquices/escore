import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        ResizablePanelGroup: {
            flags: ['required'],
            children: [
                {ResizablePanel: {flags: ['required', 'non-empty']}},
                {
                    Group: {
                        flags: ['required', 'repeatable'],
                        children: [
                            {ResizableHandle: {flags: ['required', 'one-liner']}},
                            {ResizablePanel: {flags: ['required', 'non-empty']}},
                        ],
                    },
                },
            ],
        },
    },
];

export default createComponentRules(structure);
