import { unwrapScriptExpression } from './script-props.js';

export const inertiaPackages = new Set(['@inertiajs/vue3', '@inertiajs/core', '@inertiajs/react', '@inertiajs/svelte']);

// Resolve actual imports and form instances, including aliases and lexical this.
export const createInertiaReceiverResolver = (sourceCode) => {
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
  const hasNativeFormMethod = (call, method) => {
    if (!isFormFactory(call.callee)) return false;
    if (method !== 'submit' || imported(call.callee).name === 'useForm') return true;

    const definition = unwrapScriptExpression(call.arguments[1]);

    // Inertia Plus definitions may replace submit with an application method
    // whose arguments are not URLs. Unknown definitions cannot prove otherwise.
    return definition?.type === 'ObjectExpression' && definition.properties.every((property) => {
      if (property.type !== 'Property') return false;

      const name = !property.computed && property.key.type === 'Identifier'
        ? property.key.name
        : property.key.type === 'Literal' ? String(property.key.value) : undefined;
      return name !== undefined && name !== 'submit';
    });
  };
  const isFormMethodThis = (node, method) => {
    let parent = node.parent;

    while (parent) {
      // Arrow callbacks retain the surrounding method's this; ordinary functions do not.
      if (['FunctionExpression', 'FunctionDeclaration'].includes(parent.type)) {
        const property = parent.parent;
        const definition = property?.type === 'Property' ? property.parent : undefined;
        const call = definition?.parent;

        return definition?.type === 'ObjectExpression' && call?.type === 'CallExpression'
          && call.arguments.includes(definition) && hasNativeFormMethod(call, method);
      }

      parent = parent.parent;
    }

    return false;
  };
  const isInertiaReceiver = (expression, method, seen = new Set()) => {
    const node = unwrapScriptExpression(expression);

    if (!node) {
      return false;
    }

    const binding = imported(node);

    if (binding?.name === 'router' && inertiaPackages.has(binding.source)) {
      return 'router';
    }

    if (node.type === 'ThisExpression') {
      return isFormMethodThis(node, method) ? 'form' : false;
    }

    if (node.type === 'MemberExpression' && node.object.type === 'ThisExpression'
      && propertyName(node) === '$inertia') {
      return 'router';
    }

    if (node.type === 'CallExpression') {
      if (hasNativeFormMethod(node, method)) return 'form';
      const callee = unwrapScriptExpression(node.callee);
      // Inertia form.transform(callback) returns the same form instance.
      return callee?.type === 'MemberExpression' && propertyName(callee) === 'transform'
        && isInertiaReceiver(callee.object, method, seen) === 'form' ? 'form' : false;
    }

    if (node.type === 'Identifier') {
      const variable = findVariable(node);

      if (node.name === '$inertia' && !variable?.defs.length) {
        return 'router';
      }

      if (variable && !seen.has(variable)) {
        seen.add(variable);
        const definition = variable.defs.find((entry) => entry.type === 'Variable'
          && entry.parent.kind === 'const');

        return definition ? isInertiaReceiver(definition.node.init, method, seen) : false;
      }
    }

    return false;
  };
  return isInertiaReceiver;
};

const routerOptions = new Map([
  ['get', 2], ['post', 2], ['put', 2], ['patch', 2],
  ['delete', 1], ['visit', 1], ['prefetch', 1],
  ['reload', 0], ['push', 0], ['replace', 0],
]);
const formMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'submit']);

// The formatting rules apply only to calls inside Vue script sections.
export default (sourceCode) => {
  const scripts = sourceCode.parserServices.getDocumentFragment?.()?.children.filter(
    (node) => node.type === 'VElement' && node.rawName === 'script',
  ) ?? [];
  const receiverKind = createInertiaReceiverResolver(sourceCode);

  return (call) => {
    const script = scripts.find((node) => call.range[0] >= node.startTag.range[1]
      && call.range[1] <= (node.endTag?.range[0] ?? node.range[1]));
    const callee = unwrapScriptExpression(call.callee);
    if (!script || callee?.type !== 'MemberExpression') return undefined;
    const method = !callee.computed && callee.property.type === 'Identifier'
      ? callee.property.name
      : callee.property.type === 'Literal' ? callee.property.value : undefined;
    const kind = receiverKind(callee.object, method);
    let optionsIndex;

    if (kind === 'router' && routerOptions.has(method)) {
      optionsIndex = routerOptions.get(method);
    } else if (kind === 'form' && formMethods.has(method)) {
      optionsIndex = 1;
      if (method === 'submit') {
        const first = unwrapScriptExpression(call.arguments[0]);
        if (call.arguments.length >= 3 || (first?.type === 'Literal' && typeof first.value === 'string')) {
          optionsIndex = 2; // submit(method, url, options)
        } else if (call.arguments.length === 1 && first?.type === 'ObjectExpression') {
          const hasRouteKey = first.properties.some((property) => property.type === 'Property'
            && ['url', 'method'].includes(property.key.name ?? property.key.value));
          optionsIndex = hasRouteKey ? 1 : 0; // submit(route, options) or submit(options)
        }
      }
    } else {
      return undefined;
    }

    // A spread before the expected argument makes its position unknown.
    const options = call.arguments.slice(0, optionsIndex + 1).some((argument) => argument.type === 'SpreadElement')
      ? undefined : unwrapScriptExpression(call.arguments[optionsIndex]);
    return { method, kind, options, script };
  };
};
