// ESLint rules specific to Inertia Plus.

// -----------------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------------

const packageName = 'escore-packages/inertia-plus';

// Openable surfaces share naming and options requirements.
// AlertDialog is included by its Dialog suffix.
const surfaceSuffixes = ['Dialog', 'Sheet', 'Drawer'];

function isSurfaceName(name) {
  return surfaceSuffixes.some((suffix) => name.endsWith(suffix));
}

function unwrapExpression(node) {
  while (node && [
    'TSAsExpression',
    'TSTypeAssertion',
    'TSSatisfiesExpression',
    'TSNonNullExpression',
    'TSInstantiationExpression',
    'ChainExpression',
  ].includes(node.type)) {
    node = node.expression;
  }

  return node;
}

function findVariable(sourceCode, node) {
  let scope = sourceCode.getScope(node);

  while (scope) {
    const variable = scope.set.get(node.name);

    if (variable) {
      return variable;
    }

    scope = scope.upper;
  }

  return undefined;
}

function propertyName(node) {
  if (!node.computed && node.key.type === 'Identifier') {
    return node.key.name;
  }

  return node.key.type === 'Literal' ? String(node.key.value) : undefined;
}

function factoryName(sourceCode, expression) {
  const node = unwrapExpression(expression);
  const identifier = node?.type === 'MemberExpression' ? unwrapExpression(node.object) : node;

  if (identifier?.type !== 'Identifier') return undefined;

  const variable = findVariable(sourceCode, identifier);
  const binding = variable?.defs.find((definition) => definition.type === 'ImportBinding');
  let name;

  if (!variable && node.type === 'Identifier') {
    name = node.name;
  } else if (binding?.parent?.source?.value === packageName) {
    if (node.type === 'Identifier' && binding.node.type === 'ImportSpecifier') {
      name = binding.node.imported.name ?? binding.node.imported.value;
    } else if (node.type === 'MemberExpression' && binding.node.type === 'ImportNamespaceSpecifier') {
      name = node.computed ? node.property.value : node.property.name;
    }
  }

  return ['useInertiaPlus', 'useInertiaPlusForm'].includes(name) ? name : undefined;
}

function consumingDeclarator(call) {
  let node = call;

  while (node.parent && unwrapExpression(node.parent) === call) {
    node = node.parent;
  }

  return node.parent?.type === 'VariableDeclarator' && node.parent.init === node
    ? node.parent
    : undefined;
}

function formDefinition(sourceCode, node) {
  return factoryName(sourceCode, node.callee) === 'useInertiaPlusForm'
    ? unwrapExpression(node.arguments[1])
    : undefined;
}

function functionValue(sourceCode, expression, seen = new Set()) {
  const node = unwrapExpression(expression);
  if (!node || seen.has(node)) return undefined;
  seen.add(node);

  if (['FunctionExpression', 'ArrowFunctionExpression', 'FunctionDeclaration'].includes(node.type)) {
    return node;
  }

  if (node.type === 'Identifier') {
    const definition = findVariable(sourceCode, node)?.defs[0];
    if (definition?.type === 'FunctionName') return definition.node;
    if (definition?.type === 'Variable') return functionValue(sourceCode, definition.node.init, seen);
  }

  return undefined;
}

function callsBeforeSubmit(sourceCode, node) {
  if (!node || ['FunctionExpression', 'ArrowFunctionExpression', 'FunctionDeclaration',
    'ClassExpression', 'ClassDeclaration'].includes(node.type)) return false;

  if (node.type === 'CallExpression') {
    const callee = unwrapExpression(node.callee);
    if (callee?.type === 'MemberExpression'
      && unwrapExpression(callee.object)?.type === 'ThisExpression'
      && (callee.computed ? callee.property.value : callee.property.name) === 'beforeSubmit') {
      return true;
    }
  }

  return (sourceCode.visitorKeys[node.type] ?? []).some((key) => {
    const children = Array.isArray(node[key]) ? node[key] : [node[key]];
    return children.some((child) => callsBeforeSubmit(sourceCode, child));
  });
}

// -----------------------------------------------------------------------------
// Rule: inertia-plus-form-options
// Require explicit openable: true/false and minimumLoading: true/false.
// No autofix: choosing either option changes the form's behavior.
// -----------------------------------------------------------------------------

const requireFormOptions = {
  meta: {
    type: 'problem',
    docs: {
      description: 'require explicit boolean options for useInertiaPlusForm',
    },
    schema: [],
    messages: {
      options: 'useInertiaPlusForm requires an options object with explicit openable and minimumLoading booleans.',
      missing: 'Set {{ option }} explicitly to true or false in useInertiaPlusForm options.',
      boolean: '{{ option }} must be explicitly true or false and must not be overridden by a later spread or computed property.',
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        if (factoryName(context.sourceCode, node.callee) !== 'useInertiaPlusForm') {
          return;
        }

        const options = unwrapExpression(node.arguments[0]);

        if (options?.type !== 'ObjectExpression') {
          context.report({ node: options ?? node, messageId: 'options' });
          return;
        }

        for (const option of ['openable', 'minimumLoading']) {
          let property;
          let mayBeOverridden = false;

          // The last assignment wins. Unknown later properties cannot guarantee a boolean.
          for (const entry of [...options.properties].reverse()) {
            if (entry.type === 'SpreadElement' || propertyName(entry) === undefined) {
              mayBeOverridden = true;
              continue;
            }

            if (propertyName(entry) === option) {
              property = entry;
              break;
            }
          }

          if (!property) {
            context.report({ node: options, messageId: 'missing', data: { option } });
            continue;
          }

          const value = unwrapExpression(property.value);

          if (mayBeOverridden || property.kind !== 'init' || property.method
            || value?.type !== 'Literal' || typeof value.value !== 'boolean') {
            context.report({ node: property, messageId: 'boolean', data: { option } });
          }
        }
      },
    };
  },
};

// -----------------------------------------------------------------------------
// Rule: inertia-plus-const
// Assign each composable directly to one named const. No declaration autofix.
// -----------------------------------------------------------------------------

const requireConst = {
  meta: {
    type: 'problem',
    docs: { description: 'require a named const for Inertia Plus composables' },
    schema: [],
    messages: { declaration: '{{ factory }} must be assigned directly to a named const.' },
  },

  create(context) {
    return {
      CallExpression(node) {
        const factory = factoryName(context.sourceCode, node.callee);
        if (!factory) return;

        const declarator = consumingDeclarator(node);
        if (declarator?.id.type !== 'Identifier' || declarator.parent.kind !== 'const') {
          context.report({ node, messageId: 'declaration', data: { factory } });
        }
      },
    };
  },
};

// -----------------------------------------------------------------------------
// Rule: inertia-plus-form-name
// Form variables end in Form or an openable-surface suffix. No rename autofix.
// -----------------------------------------------------------------------------

const requireFormName = {
  meta: {
    type: 'problem',
    docs: { description: 'require Form, Dialog, Sheet, or Drawer suffixes for Inertia Plus forms' },
    schema: [],
    messages: { name: 'useInertiaPlusForm variable names must end in Form, Dialog, Sheet, or Drawer.' },
  },

  create(context) {
    return {
      CallExpression(node) {
        if (factoryName(context.sourceCode, node.callee) !== 'useInertiaPlusForm') return;

        const declarator = consumingDeclarator(node);
        if (declarator?.id.type === 'Identifier' && !declarator.id.name.endsWith('Form')
          && !isSurfaceName(declarator.id.name)) {
          context.report({ node: declarator.id, messageId: 'name' });
        }
      },
    };
  },
};

// -----------------------------------------------------------------------------
// Rule: inertia-plus-single-line-opening
// Keep the declaration through the definition's opening brace on one line.
// Autofix whitespace only; preserve comments and multiline token contents.
// -----------------------------------------------------------------------------

function hasMultilinePrefixBody(sourceCode, node, end) {
  if (!node || node.range[0] >= end) return false;

  // Newlines can terminate statements, class fields, and type members. Only
  // inspect the prefix; the definition body itself is not being flattened.
  if (['BlockStatement', 'ClassBody', 'StaticBlock', 'TSTypeLiteral',
    'TSInterfaceBody', 'TSModuleBlock'].includes(node.type)
    && node.loc.start.line !== node.loc.end.line) return true;

  return (sourceCode.visitorKeys[node.type] ?? []).some((key) => {
    const children = Array.isArray(node[key]) ? node[key] : [node[key]];
    return children.some((child) => hasMultilinePrefixBody(sourceCode, child, end));
  });
}

const requireSingleLineOpening = {
  meta: {
    type: 'layout',
    docs: { description: 'keep Inertia Plus declaration openings on one line' },
    fixable: 'whitespace',
    schema: [],
    messages: { opening: 'Keep the declaration, options, and definition opening brace on one line.' },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    return {
      CallExpression(node) {
        const factory = factoryName(sourceCode, node.callee);
        if (!factory) return;

        const declarator = consumingDeclarator(node);
        const definition = unwrapExpression(node.arguments[factory === 'useInertiaPlusForm' ? 1 : 0]);
        if (!declarator || definition?.type !== 'ObjectExpression') return;

        const declaration = declarator.parent;
        const start = declaration.declarations[0] === declarator ? declaration : declarator;
        const opening = sourceCode.getFirstToken(definition);
        if (start.loc.start.line === opening.loc.end.line) return;

        context.report({
          node,
          messageId: 'opening',
          fix(fixer) {
            if (hasMultilinePrefixBody(sourceCode, start, opening.range[0])) return null;

            const tokens = sourceCode.getTokens(start, { includeComments: true })
              .filter((token) => token.range[1] <= opening.range[1]);

            // Moving comments or rewriting strings/templates can change behavior.
            if (tokens.some((token) => ['Line', 'Block'].includes(token.type)
              || token.loc.start.line !== token.loc.end.line)) return null;

            const fixes = [];
            for (let index = 1; index < tokens.length; index++) {
              const range = [tokens[index - 1].range[1], tokens[index].range[0]];
              const gap = sourceCode.text.slice(...range);
              if (/^[\s]*$/.test(gap) && /[\r\n\u2028\u2029]/.test(gap)) {
                fixes.push(fixer.replaceTextRange(range, ' '));
              }
            }

            return fixes;
          },
        });
      },
    };
  },
};

// -----------------------------------------------------------------------------
// Rule: inertia-plus-form-definition
// Require an inline definition with explicit member names for reliable checks.
// -----------------------------------------------------------------------------

const requireFormDefinition = {
  meta: {
    type: 'problem',
    docs: { description: 'require explicit Inertia Plus form definitions' },
    schema: [],
    messages: {
      definition: 'Define useInertiaPlusForm fields and methods in an inline object.',
      unknown: 'Declare this form\'s data fields and methods explicitly in the inline object instead of using spreads or computed member names. Data fields are allowed; the only custom methods are submit() and optional beforeSubmit().',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    return {
      CallExpression(node) {
        if (factoryName(sourceCode, node.callee) !== 'useInertiaPlusForm') return;

        const definition = formDefinition(sourceCode, node);
        if (definition?.type !== 'ObjectExpression') {
          context.report({ node: definition ?? node, messageId: 'definition' });
          return;
        }

        for (const property of definition.properties) {
          if (property.type === 'SpreadElement' || propertyName(property) === undefined) {
            context.report({ node: property, messageId: 'unknown' });
          }
        }
      },
    };
  },
};

// -----------------------------------------------------------------------------
// Rule: inertia-plus-form-submit
// Require the submit member. Its function shape is checked separately.
// -----------------------------------------------------------------------------

const requireFormSubmit = {
  meta: {
    type: 'problem',
    docs: { description: 'require submit in every Inertia Plus form' },
    schema: [],
    messages: { submit: 'useInertiaPlusForm requires a submit() method.' },
  },

  create(context) {
    return {
      CallExpression(node) {
        const definition = formDefinition(context.sourceCode, node);
        if (definition?.type !== 'ObjectExpression') return;

        const hasSubmit = definition.properties.some((property) =>
          property.type === 'Property' && propertyName(property) === 'submit');

        if (!hasSubmit) {
          context.report({ node: definition, messageId: 'submit' });
        }
      },
    };
  },
};

// -----------------------------------------------------------------------------
// Rule: inertia-plus-form-methods
// Allow only submit and beforeSubmit as custom methods. Data fields are allowed.
// -----------------------------------------------------------------------------

const requireFormMethods = {
  meta: {
    type: 'problem',
    docs: { description: 'restrict custom Inertia Plus form method names' },
    schema: [],
    messages: {
      extra: 'The custom method {{ name }} is not allowed on useInertiaPlusForm. Keep data fields, submit(), and optional beforeSubmit(); place preparation in beforeSubmit() and request logic in submit(). Preserve the behavior when restructuring. Use useInertiaPlus for broader domain state that needs additional methods.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    return {
      CallExpression(node) {
        const definition = formDefinition(sourceCode, node);
        if (definition?.type !== 'ObjectExpression') return;

        for (const property of definition.properties) {
          if (property.type !== 'Property') continue;

          const name = propertyName(property);
          if (name === undefined || name === 'submit' || name === 'beforeSubmit') continue;

          if (functionValue(sourceCode, property.value) || property.method || property.kind !== 'init') {
            context.report({ node: property, messageId: 'extra', data: { name } });
          }
        }
      },
    };
  },
};

// -----------------------------------------------------------------------------
// Rule: inertia-plus-form-method-context
// submit and beforeSubmit must be regular functions that can bind this to form.
// -----------------------------------------------------------------------------

const requireFormMethodContext = {
  meta: {
    type: 'problem',
    docs: { description: 'require form methods that support the form this context' },
    schema: [],
    messages: {
      method: '{{ name }} must be a regular function method, such as {{ name }}() { ... }, so this refers to the form.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    return {
      CallExpression(node) {
        const definition = formDefinition(sourceCode, node);
        if (definition?.type !== 'ObjectExpression') return;

        for (const property of definition.properties) {
          if (property.type !== 'Property') continue;

          const name = propertyName(property);
          if (name !== 'submit' && name !== 'beforeSubmit') continue;

          const fn = functionValue(sourceCode, property.value);
          if (property.kind !== 'init' || !fn || fn.type === 'ArrowFunctionExpression') {
            context.report({ node: property, messageId: 'method', data: { name } });
          }
        }
      },
    };
  },
};

// -----------------------------------------------------------------------------
// Rule: inertia-plus-before-submit-call
// When beforeSubmit exists, submit must explicitly call this.beforeSubmit().
// Calls inside nested callbacks do not count. No automatic behavior changes.
// -----------------------------------------------------------------------------

const requireBeforeSubmitCall = {
  meta: {
    type: 'problem',
    docs: { description: 'require submit to invoke the optional beforeSubmit method' },
    schema: [],
    messages: { call: 'Call this.beforeSubmit(...) directly from submit() after the processing guard and before the request. Pass the preparation arguments it needs; a call inside a nested callback does not satisfy this rule.' },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    return {
      CallExpression(node) {
        const definition = formDefinition(sourceCode, node);
        if (definition?.type !== 'ObjectExpression') return;

        const members = new Map(definition.properties
          .filter((property) => property.type === 'Property')
          .map((property) => [propertyName(property), property]));
        const submit = members.get('submit');
        const beforeSubmit = members.get('beforeSubmit');
        const submitFunction = functionValue(sourceCode, submit?.value);
        const beforeFunction = functionValue(sourceCode, beforeSubmit?.value);

        // Presence and function shape have their own rules.
        if (!submitFunction || !beforeFunction || submit?.kind !== 'init'
          || beforeSubmit?.kind !== 'init' || submitFunction.type === 'ArrowFunctionExpression'
          || beforeFunction.type === 'ArrowFunctionExpression') return;

        if (!callsBeforeSubmit(sourceCode, submitFunction.body)) {
          context.report({ node: submit, messageId: 'call' });
        }
      },
    };
  },
};

// -----------------------------------------------------------------------------
// Rule: inertia-plus-submit-processing-guard
// submit must start with if (this.processing) return; before any other work.
// Braces around the bare return are allowed. No behavior-changing autofix.
// -----------------------------------------------------------------------------

const requireSubmitProcessingGuard = {
  meta: {
    type: 'problem',
    docs: { description: 'require a processing guard at the start of form submit methods' },
    schema: [],
    messages: { guard: 'Start submit() with if (this.processing) return; before any other work.' },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    return {
      CallExpression(node) {
        const definition = formDefinition(sourceCode, node);
        if (definition?.type !== 'ObjectExpression') return;

        const submit = definition.properties
          .filter((property) => property.type === 'Property' && propertyName(property) === 'submit')
          .at(-1);
        const fn = functionValue(sourceCode, submit?.value);

        // Missing/invalid methods are handled by their own rules.
        if (!fn || submit?.kind !== 'init' || fn.type === 'ArrowFunctionExpression'
          || fn.body?.type !== 'BlockStatement') return;

        const first = fn.body.body[0];
        const condition = unwrapExpression(first?.test);
        const consequent = first?.consequent;
        const exit = consequent?.type === 'BlockStatement' && consequent.body.length === 1
          ? consequent.body[0]
          : consequent;

        const hasGuard = first?.type === 'IfStatement'
          && !first.alternate
          && condition?.type === 'MemberExpression'
          && !condition.computed
          && !condition.optional
          && unwrapExpression(condition.object)?.type === 'ThisExpression'
          && condition.property.name === 'processing'
          && exit?.type === 'ReturnStatement'
          && exit.argument === null;

        if (!hasGuard) {
          context.report({ node: submit, messageId: 'guard' });
        }
      },
    };
  },
};

// -----------------------------------------------------------------------------
// Rule: inertia-plus-surface-openable
// All openable-surface form names require openable: true.
// No autofix: this option changes the form's behavior.
// -----------------------------------------------------------------------------

const requireSurfaceOpenable = {
  meta: {
    type: 'problem',
    docs: { description: 'require openable: true for Inertia Plus surface forms' },
    schema: [],
    messages: { openable: 'Form names ending in Dialog, Sheet, or Drawer require openable: true.' },
  },

  create(context) {
    return {
      CallExpression(node) {
        if (factoryName(context.sourceCode, node.callee) !== 'useInertiaPlusForm') return;

        const declarator = consumingDeclarator(node);
        if (declarator?.id.type !== 'Identifier' || !isSurfaceName(declarator.id.name)) return;

        const options = unwrapExpression(node.arguments[0]);
        if (options?.type !== 'ObjectExpression') return;

        const property = options.properties
          .filter((entry) => entry.type === 'Property' && propertyName(entry) === 'openable')
          .at(-1);
        const value = unwrapExpression(property?.value);

        if (property?.kind !== 'init' || value?.type !== 'Literal' || value.value !== true) {
          context.report({ node: property ?? options, messageId: 'openable' });
        }
      },
    };
  },
};

// -----------------------------------------------------------------------------
// Exported rules
// -----------------------------------------------------------------------------

export default {
  'inertia-plus-form-options': requireFormOptions,
  'inertia-plus-const': requireConst,
  'inertia-plus-form-name': requireFormName,
  'inertia-plus-single-line-opening': requireSingleLineOpening,
  'inertia-plus-form-definition': requireFormDefinition,
  'inertia-plus-form-submit': requireFormSubmit,
  'inertia-plus-form-methods': requireFormMethods,
  'inertia-plus-form-method-context': requireFormMethodContext,
  'inertia-plus-before-submit-call': requireBeforeSubmitCall,
  'inertia-plus-submit-processing-guard': requireSubmitProcessingGuard,
  'inertia-plus-surface-openable': requireSurfaceOpenable,
};
