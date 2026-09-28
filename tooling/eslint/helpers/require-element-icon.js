export default ({ elements }) => ({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'require a leading imported icon in every ' + elements[0],
    },
    schema: [{
      type: 'object',
      properties: {
        sources: {
          type: 'array',
          items: { type: 'string', minLength: 1 },
          minItems: 1,
          uniqueItems: true,
        },
      },
      additionalProperties: false,
    }],
    messages: {
      missing: '<' + elements[0] + '> must start with a direct-child icon imported from a configured icon package.',
    },
  },

  create(context) {
    const parserServices = context.sourceCode.parserServices;

    if (!parserServices.defineTemplateBodyVisitor) {
      return {};
    }

    const sources = new Set(context.options[0]?.sources ?? ['@lucide/vue', 'lucide-vue-next']);
    const icons = new Set();
    const namespaces = new Set();
    const kebabCase = (name) => name
      .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase();
    const isImportedIcon = (node) => {
      if (node?.type !== 'VElement') {
        return false;
      }

      if (icons.has(node.rawName)) {
        return true;
      }

      const parts = node.rawName.split('.');

      return parts.length === 2 && namespaces.has(parts[0]);
    };

    return parserServices.defineTemplateBodyVisitor({
      VElement(node) {
        if (!elements.includes(node.rawName)) {
          return;
        }

        // Ignore whitespace/comments, but do not permit visible text before the icon.
        const icon = node.children.find((child) => child.type !== 'VHTMLComment'
          && !(child.type === 'VText' && !child.value.trim()));

        if (!isImportedIcon(icon)) {
          context.report({ loc: node.startTag.loc, messageId: 'missing' });
        }
      },
    }, {
      ImportDeclaration(node) {
        if (!sources.has(node.source.value) || node.importKind === 'type') {
          return;
        }

        for (const specifier of node.specifiers) {
          if (specifier.importKind === 'type') {
            continue;
          }

          if (specifier.type === 'ImportNamespaceSpecifier') {
            namespaces.add(specifier.local.name);
          } else {
            // Track the local binding, including renamed imports such as Eye as ViewIcon.
            icons.add(specifier.local.name);
            icons.add(kebabCase(specifier.local.name));
          }
        }
      },
    });
  },
});
