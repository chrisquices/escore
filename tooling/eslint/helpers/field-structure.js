// Shared template relationships. Each rule decides which relationship to require.
export const isElement = (node, names) => node?.type === 'VElement' && names.includes(node.rawName);
export const isField = (node) => isElement(node, ['Field', 'field']);
export const isFieldLabel = (node) => isElement(node, ['FieldLabel', 'field-label']);
export const isFieldContent = (node) => isElement(node, ['FieldContent', 'field-content']);
export const isInput = (node) => isElement(node, ['Input', 'input']);

export const findContainingForm = (node) => {
  for (let parent = node.parent; parent?.type === 'VElement'; parent = parent.parent) {
    if (parent.rawName === 'form') return parent;
  }

  return undefined;
};

export const templateVisitor = (context, visitor) => (
  context.sourceCode.parserServices.defineTemplateBodyVisitor?.(visitor) ?? {}
);
