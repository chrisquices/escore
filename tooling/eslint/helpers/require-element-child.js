import { matchesStructureElement, structureVisitor } from './element-structure.js';

// Presence is independent of the allowed-child structure and has no automatic fix.
export default ({ structure, parent, child }) => ({
  meta: {
    type: 'problem',
    docs: { description: `require ${parent} to directly have ${child} within ${structure.root}` },
    schema: [],
    messages: {
      missing: '<{{ parent }}> requires a direct <{{ child }}> child. Add the component, or move an existing nested one directly under <{{ parent }}> while preserving its content and bindings.',
    },
  },

  create(context) {
    return structureVisitor(context, structure, parent, (node) => {
      if (node.children.some((candidate) => matchesStructureElement(candidate, child))) return;

      context.report({ loc: node.startTag.loc, messageId: 'missing', data: { parent, child } });
    });
  },
});
