import { unwrapScriptExpression } from '../../helpers/script-props.js';
import { createInertiaReceiverResolver, inertiaPackages } from '../../helpers/inertia-request.js';

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
    const requestMethods = new Set([
      'get', 'post', 'put', 'patch', 'delete', 'head', 'options',
      'visit', 'submit', 'prefetch', 'push', 'replace',
    ]);
    const isInertiaReceiver = createInertiaReceiverResolver(sourceCode);
    const propertyName = (node) => !node.computed && node.property.type === 'Identifier'
      ? node.property.name
      : node.property.type === 'Literal' ? node.property.value : undefined;
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
          || !isInertiaReceiver(callee.object, propertyName(callee))) {
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
