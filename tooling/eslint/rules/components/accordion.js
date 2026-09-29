import createComponentRules from '../../helpers/create-component-rules.js';

export const structure = [
    {Comment: {flags: ['required']}},
    {
        Accordion: {
            flags: ['required'],
            children: [
                {
                    AccordionItem: {
                        flags: ['required', 'repeatable'],
                        children: [
                            {AccordionTrigger: {flags: ['required', 'comment-source', 'one-liner']}},
                            {BlankLine: {flags: ['required']}},
                            {AccordionContent: {flags: ['required']}},
                        ],
                    },
                },
            ],
        },
    },
];

export default createComponentRules(structure);
