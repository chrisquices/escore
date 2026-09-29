export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Use ordinary functions in Vue script sections unless an arrow captures this, arguments, super, or new.target.',
    },
    schema: [],
    messages: {
      forbidden: 'Replace this arrow with function (...) { ... }. Preserve async, parameters and types, and explicitly return the value of an expression body. Arrows are allowed only when they capture this, arguments, super, or new.target from the surrounding context.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const scripts = sourceCode.parserServices.getDocumentFragment?.()?.children.filter(
      (node) => node.type === 'VElement' && node.rawName === 'script',
    ) ?? [];
    if (!scripts.length) return {};

    const retained = new Set();
    const argumentReferences = new Map();
    for (const scope of sourceCode.scopeManager.scopes) {
      for (const reference of scope.references) {
        if (reference.identifier.name === 'arguments' && reference.isValueReference !== false) {
          argumentReferences.set(reference.identifier, reference.resolved);
        }
      }
    }

    const retainLexicalArrows = (reference, variable) => {
      let child = reference;
      for (let parent = reference.parent; parent; child = parent, parent = parent.parent) {
        // TypeScript typeof queries do not read a captured value at runtime.
        if (parent.type === 'TSTypeQuery') break;
        // Normal functions, field initializers, and static blocks establish their
        // own context. Computed class keys still evaluate in the outer context.
        if (['FunctionExpression', 'FunctionDeclaration', 'StaticBlock'].includes(parent.type)) break;
        if (['PropertyDefinition', 'AccessorProperty'].includes(parent.type) && child === parent.value) break;
        if (parent.type !== 'ArrowFunctionExpression') continue;

        // A locally declared parameter/variable named arguments is not captured
        // from outside this arrow. A nested arrow can still capture that binding.
        const localBinding = variable?.identifiers.some((identifier) => identifier.range[0] >= parent.range[0]
          && identifier.range[1] <= parent.range[1]);
        if (!localBinding) retained.add(parent);
      }
    };

    return {
      ThisExpression(node) {
        retainLexicalArrows(node);
      },
      Super(node) {
        retainLexicalArrows(node);
      },
      MetaProperty(node) {
        if (node.meta.name === 'new' && node.property.name === 'target') retainLexicalArrows(node);
      },
      Identifier(node) {
        if (argumentReferences.has(node)) retainLexicalArrows(node, argumentReferences.get(node));
      },
      'ArrowFunctionExpression:exit'(node) {
        const insideScript = scripts.some((script) => node.range[0] >= script.startTag.range[1]
          && node.range[1] <= (script.endTag?.range[0] ?? script.range[1]));
        if (insideScript && !retained.has(node)) context.report({ node, messageId: 'forbidden' });
      },
    };
  },
};
