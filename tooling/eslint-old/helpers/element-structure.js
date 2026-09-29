export const matchesStructureElement = (node, name) => {
  if (node?.type !== 'VElement') return false;

  const kebab = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

  // Multiword components support kebab-case; native <button> is not <Button>.
  return node.rawName === name || (kebab.includes('-') && node.rawName === kebab);
};

export const isStructureWhitespace = (node) => node.type === 'VText' && /^\s*$/.test(node.value);

export const structureChildren = (node) => node.children.filter(
  (child) => child.type !== 'VComment' && !isStructureWhitespace(child),
);

export const belongsToStructure = (node, structure) => {
  if (matchesStructureElement(node, structure.root)) return true;

  const containers = Object.keys(structure.elements);

  for (let parent = node.parent; parent?.type === 'VElement'; parent = parent.parent) {
    if (matchesStructureElement(parent, structure.root)) return true;

    // Do not enforce this family inside a leaf's unrestricted slot content.
    // Invalid wrappers are reported by the enclosing container's children rule.
    if (!containers.some((name) => matchesStructureElement(parent, name))) return false;
  }

  return false;
};

export const structureVisitor = (context, structure, element, visit) => (
  context.sourceCode.parserServices.defineTemplateBodyVisitor?.({
    VElement(node) {
      if (matchesStructureElement(node, element) && belongsToStructure(node, structure)) visit(node);
    },
  }) ?? {}
);
