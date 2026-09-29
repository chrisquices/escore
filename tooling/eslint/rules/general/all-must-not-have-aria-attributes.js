function unwrap(expression) {
    while (expression && [
        'TSAsExpression', 'TSTypeAssertion', 'TSNonNullExpression',
        'TSSatisfiesExpression', 'ParenthesizedExpression',
    ].includes(expression.type)) {
        expression = expression.expression;
    }
    return expression;
}

function literalName(expression) {
    expression = unwrap(expression);
    if (expression?.type === 'Literal' && typeof expression.value === 'string') return expression.value;
    if (expression?.type === 'TemplateLiteral' && expression.expressions.length === 0) {
        return expression.quasis[0].value.cooked;
    }
    if (expression?.type === 'BinaryExpression' && expression.operator === '+') {
        const left = literalName(expression.left);
        const right = literalName(expression.right);
        if (left !== undefined && right !== undefined) return left + right;
    }
    return undefined;
}

const isAria = (name) => typeof name === 'string' && name.toLowerCase().startsWith('aria-');

function ariaName(expression) {
    expression = unwrap(expression);
    const name = literalName(expression);
    if (isAria(name)) return name;

    // Computed names with a known aria- prefix are forbidden even with a dynamic suffix.
    if (expression?.type === 'TemplateLiteral' && isAria(expression.quasis[0].value.cooked)) return 'aria-*';
    if (expression?.type === 'BinaryExpression' && expression.operator === '+' && ariaName(expression.left)) return 'aria-*';
    return undefined;
}

export default {
    meta: {
        type: 'problem',
        docs: {description: 'Disallow aria-* attributes on all native elements and Vue components.'},
        fixable: 'code',
        schema: [],
        messages: {
            forbidden: 'Remove {{ name }} from <{{ element }}>; aria-* attributes are forbidden.',
        },
    },

    create(context) {
        const sourceCode = context.sourceCode;
        const services = sourceCode.parserServices;
        if (!services.defineTemplateBodyVisitor) return {};
        const tokenStore = services.getTemplateBodyTokenStore();

        function reportAttribute(attribute, name) {
            if (!isAria(name)) return;
            context.report({
                node: attribute,
                messageId: 'forbidden',
                data: {name, element: attribute.parent.parent.rawName},
                fix(fixer) {
                    let start = attribute.range[0];
                    while (start > attribute.parent.range[0] && /\s/u.test(sourceCode.text[start - 1])) start -= 1;
                    return fixer.removeRange([start, attribute.range[1]]);
                },
            });
        }

        function checkObject(expression, element) {
            expression = unwrap(expression);
            if (expression?.type === 'ConditionalExpression') {
                checkObject(expression.consequent, element);
                checkObject(expression.alternate, element);
                return;
            }
            if (expression?.type === 'LogicalExpression') {
                checkObject(expression.left, element);
                checkObject(expression.right, element);
                return;
            }
            if (expression?.type !== 'ObjectExpression') return;

            for (const property of expression.properties) {
                if (property.type === 'SpreadElement') {
                    checkObject(property.argument, element);
                    continue;
                }
                if (property.type !== 'Property') continue;
                const name = !property.computed && property.key.type === 'Identifier'
                    ? property.key.name
                    : ariaName(property.key);
                if (!isAria(name)) continue;

                context.report({
                    node: property,
                    messageId: 'forbidden',
                    data: {name, element},
                    fix(fixer) {
                        const next = tokenStore.getTokenAfter(property);
                        const previous = tokenStore.getTokenBefore(property);
                        const comma = next?.value === ',' ? next : previous?.value === ',' ? previous : undefined;
                        // Separate edits keep comments between the property and comma intact.
                        return comma ? [fixer.remove(property), fixer.remove(comma)] : fixer.remove(property);
                    },
                });
            }
        }

        return services.defineTemplateBodyVisitor({
            VAttribute(attribute) {
                if (!attribute.directive) {
                    reportAttribute(attribute, attribute.key.name);
                    return;
                }
                if (attribute.key.name.name !== 'bind') return;

                const argument = attribute.key.argument;
                if (argument) {
                    const name = argument.type === 'VIdentifier' ? argument.name : ariaName(argument.expression);
                    reportAttribute(attribute, name);
                    return;
                }

                checkObject(attribute.value?.expression, attribute.parent.parent.rawName);
            },
        });
    },
};
