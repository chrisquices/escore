import { unwrapScriptExpression } from '../../helpers/script-props.js';

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'disallow hardcoded URLs in script and template Inertia requests, Link hrefs, and anchor hrefs',
    },
    schema: [],
    messages: {
      request: 'Replace this hardcoded Inertia URL with the project\'s routing helper. With Wayfinder, use the generated controller action\'s .url, such as KeyController.update(key.uid).url. Preserve the HTTP method and parameters; moving the literal into a variable is not the intended fix.',
      href: 'Replace the hardcoded href on <{{ component }}> with a binding to the project\'s routing helper. With Wayfinder, use the generated controller action\'s .url. Preserve the destination and parameters; do not merely move the literal into a variable.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const linkNames = new Set(['Link', 'a']);
    const inertiaPackages = new Set(['@inertiajs/vue3', '@inertiajs/core', '@inertiajs/react', '@inertiajs/svelte']);
    const requestMethods = new Set([
      'get', 'post', 'put', 'patch', 'delete', 'head', 'options',
      'visit', 'submit', 'prefetch', 'push', 'replace',
    ]);
    const propertyName = (node) => !node.computed && node.property.type === 'Identifier'
      ? node.property.name
      : node.property.type === 'Literal' ? node.property.value : undefined;
    const findVariable = (node) => {
      // Template expressions live outside the script AST's module scope.
      // Their references distinguish script bindings from v-for/slot locals
      // and variables declared inside inline callbacks.
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (parent.type !== 'VExpressionContainer') continue;
        const reference = parent.references?.find((entry) => entry.id === node);
        if (!reference || reference.variable) return { defs: [{ type: 'TemplateVariable' }] };
        const moduleScope = sourceCode.scopeManager.scopes.find((scope) => scope.type === 'module');
        return (moduleScope ?? sourceCode.scopeManager.globalScope).set.get(node.name);
      }

      let scope = sourceCode.getScope(node);

      while (scope) {
        const variable = scope.set.get(node.name);

        if (variable) {
          return variable;
        }

        scope = scope.upper;
      }

      return undefined;
    };
    const imported = (expression) => {
      const node = unwrapScriptExpression(expression);

      if (node?.type === 'Identifier') {
        const definition = findVariable(node)?.defs.find((entry) => entry.type === 'ImportBinding');

        if (definition) {
          return {
            source: definition.parent.source.value,
            name: definition.node.type === 'ImportNamespaceSpecifier'
              ? '*'
              : definition.node.imported?.name ?? definition.node.imported?.value ?? 'default',
          };
        }
      }

      if (node?.type === 'MemberExpression') {
        const namespace = imported(node.object);

        if (namespace?.name === '*') {
          return { source: namespace.source, name: propertyName(node) };
        }
      }

      return undefined;
    };
    const isFormFactory = (expression) => {
      const binding = imported(expression);

      return binding && ((binding.name === 'useForm' && inertiaPackages.has(binding.source))
        || (binding.name === 'useInertiaPlusForm' && binding.source === 'escore-packages/inertia-plus'));
    };
    const isFormMethodThis = (node) => {
      let parent = node.parent;

      while (parent) {
        // Arrow callbacks retain the surrounding method's this; ordinary functions do not.
        if (['FunctionExpression', 'FunctionDeclaration'].includes(parent.type)) {
          const property = parent.parent;
          const definition = property?.type === 'Property' ? property.parent : undefined;
          const call = definition?.parent;

          return definition?.type === 'ObjectExpression' && call?.type === 'CallExpression'
            && call.arguments.includes(definition) && isFormFactory(call.callee);
        }

        parent = parent.parent;
      }

      return false;
    };
    const isInertiaReceiver = (expression, seen = new Set()) => {
      const node = unwrapScriptExpression(expression);

      if (!node) {
        return false;
      }

      const binding = imported(node);

      if (binding?.name === 'router' && inertiaPackages.has(binding.source)) {
        return true;
      }

      if (node.type === 'ThisExpression') {
        return isFormMethodThis(node);
      }

      if (node.type === 'MemberExpression' && node.object.type === 'ThisExpression'
        && propertyName(node) === '$inertia') {
        return true;
      }

      if (node.type === 'CallExpression') {
        return isFormFactory(node.callee);
      }

      if (node.type === 'Identifier') {
        const variable = findVariable(node);

        if (node.name === '$inertia' && !variable?.defs.length) {
          return true;
        }

        if (variable && !seen.has(variable)) {
          seen.add(variable);
          const definition = variable.defs.find((entry) => entry.type === 'Variable'
            && entry.parent.kind === 'const');

          return definition ? isInertiaReceiver(definition.node.init, seen) : false;
        }
      }

      return false;
    };
    const hasHardcodedUrl = (expression) => {
      const node = unwrapScriptExpression(expression);

      if (!node) {
        return false;
      }

      if (node.type === 'Literal') {
        return typeof node.value === 'string';
      }

      if (node.type === 'TemplateLiteral') {
        return node.quasis.some((part) => part.value.raw.length > 0)
          || node.expressions.some(hasHardcodedUrl);
      }

      if (node.type === 'BinaryExpression' && node.operator === '+') {
        return hasHardcodedUrl(node.left) || hasHardcodedUrl(node.right);
      }

      if (node.type === 'ConditionalExpression') {
        return hasHardcodedUrl(node.consequent) || hasHardcodedUrl(node.alternate);
      }

      if (node.type === 'LogicalExpression') {
        return hasHardcodedUrl(node.left) || hasHardcodedUrl(node.right);
      }

      if (node.type === 'ObjectExpression') {
        return node.properties.some((property) => property.type === 'Property'
          && ((!property.computed && property.key.name === 'url') || property.key.value === 'url')
          && hasHardcodedUrl(property.value));
      }

      return false;
    };
    const scriptVisitor = {
      ImportDeclaration(node) {
        if (inertiaPackages.has(node.source.value)) {
          for (const specifier of node.specifiers) {
            if (specifier.type === 'ImportSpecifier' && specifier.imported.name === 'Link') {
              linkNames.add(specifier.local.name);
            }
          }
        }
      },
      CallExpression(node) {
        const callee = unwrapScriptExpression(node.callee);

        if (callee?.type !== 'MemberExpression' || !requestMethods.has(propertyName(callee))
          || !isInertiaReceiver(callee.object)) {
          return;
        }

        // submit(method, url, options) and submit({ method, url }, options).
        const first = unwrapScriptExpression(node.arguments[0]);
        const url = propertyName(callee) === 'submit' && first?.type !== 'ObjectExpression'
          ? node.arguments[1]
          : node.arguments[0];

        if (hasHardcodedUrl(url)) {
          context.report({ node: url, messageId: 'request' });
        }
      },
    };
    const templateVisitor = {
      CallExpression: scriptVisitor.CallExpression,
      VAttribute(node) {
        const component = node.parent.parent.rawName;

        if (!linkNames.has(component)) {
          return;
        }

        const isStaticHref = !node.directive && node.key.name === 'href' && node.value;
        const argument = node.directive ? node.key.argument : undefined;
        const isBoundHref = node.directive && node.key.name.name === 'bind'
          && ((argument?.type === 'VIdentifier' && argument.name === 'href')
            || (argument?.type === 'VExpressionContainer' && argument.expression?.value === 'href'));

        if (isStaticHref || (isBoundHref && hasHardcodedUrl(node.value?.expression))) {
          context.report({ node, messageId: 'href', data: { component } });
        }
      },
    };

    return sourceCode.parserServices.defineTemplateBodyVisitor
      ? sourceCode.parserServices.defineTemplateBodyVisitor(templateVisitor, scriptVisitor)
      : scriptVisitor;
  },
};
