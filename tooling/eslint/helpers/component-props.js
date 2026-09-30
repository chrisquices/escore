import {statSync} from 'node:fs';
import {createRequire} from 'node:module';
import {basename, dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const libraryRequire = createRequire(new URL('../../../packages/js/package.json', import.meta.url));
const defaultConfig = fileURLToPath(new URL('../../../packages/js/ui/tsconfig.json', import.meta.url));
const projects = new Map();
const sources = new WeakMap();
const unknown = Symbol('unknown template value');
const camelize = (name) => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

function stamp(path) {
    const stat = statSync(path, {throwIfNoEntry: false});
    return stat ? `${stat.mtimeMs}:${stat.size}` : '';
}

function readProject(configFile) {
    const cached = projects.get(configFile);
    if (cached && [...cached.files].every(([path, version]) => stamp(path) === version)) return cached;

    const ts = libraryRequire('typescript');
    const vue = libraryRequire('@vue/language-core');
    const {proxyCreateProgram} = libraryRequire('@volar/typescript');
    const configFiles = new Set();
    const config = vue.createParsedCommandLine(ts, {
        ...ts.sys,
        readFile(path) {
            configFiles.add(path);
            return ts.sys.readFile(path);
        },
    }, configFile, true);
    if (config.errors.length) {
        throw new Error(`Cannot read component prop sources: ${ts.flattenDiagnosticMessageText(config.errors[0].messageText, ' ')}`);
    }

    const options = {...config.options, noEmit: true, allowNonTsExtensions: true};
    // Use Vue's public component type, so defaults, runtime props, and imported types agree with vue-tsc.
    const createProgram = proxyCreateProgram(ts, ts.createProgram, () => [
        vue.createVueLanguagePlugin(ts, options, {...config.vueOptions, skipTemplateCodegen: true}, (id) => id),
    ]);
    const program = createProgram({rootNames: config.fileNames, options, host: ts.createCompilerHost(options)});
    const checker = program.getTypeChecker();
    const components = new Map();
    for (const path of config.fileNames.filter((file) => file.endsWith('.vue'))) {
        const name = basename(path, '.vue');
        if (components.has(name)) throw new Error(`Multiple component sources named ${name} in ${configFile}.`);
        components.set(name, path);
    }
    const watched = new Set([...configFiles, ...program.getSourceFiles().map((file) => file.fileName)]);
    for (const path of config.fileNames) watched.add(dirname(path));
    const project = {ts, program, checker, components, props: new Map(), files: new Map([...watched].map((path) => [path, stamp(path)]))};
    projects.set(configFile, project);
    return project;
}

function readProps(project, name) {
    if (project.props.has(name)) return project.props.get(name);
    const path = project.components.get(name);
    if (!path) return undefined;
    const {ts, program, checker} = project;
    const source = program.getSourceFile(path);
    const unresolved = program.getSemanticDiagnostics(source).find((diagnostic) => [2307, 2305].includes(diagnostic.code));
    if (unresolved) throw new Error(`Cannot resolve prop source ${path}: ${ts.flattenDiagnosticMessageText(unresolved.messageText, ' ')}`);
    const component = checker.getExportsOfModule(checker.getSymbolAtLocation(source)).find((symbol) => symbol.name === 'default');
    const type = component && checker.getTypeOfSymbolAtLocation(component, source);
    const instance = type?.getConstructSignatures()[0]?.getReturnType();
    const propsSymbol = instance?.getProperty('$props');
    const parameter = type?.getCallSignatures()[0]?.getParameters()[0];
    const propsType = propsSymbol ? checker.getTypeOfSymbolAtLocation(propsSymbol, source)
        : parameter ? checker.getTypeOfSymbolAtLocation(parameter, source) : undefined;
    if (!propsType || propsType.flags & ts.TypeFlags.Any) throw new Error(`Cannot resolve props for <${name}> from ${path}.`);

    const props = new Map();
    for (const prop of checker.getPropertiesOfType(propsType)) {
        // Vue supplies these fallthrough attributes and event handlers separately from component props.
        if (['class', 'style', 'key', 'ref', 'ref_for', 'ref_key'].includes(prop.name) || /^on[A-Z]/.test(prop.name)) continue;
        const propType = checker.getTypeOfSymbolAtLocation(prop, source);
        const parts = propType.isUnion() ? propType.types : [propType];
        const expected = parts
            .filter((part) => !(prop.flags & ts.SymbolFlags.Optional) || !(part.flags & ts.TypeFlags.Undefined))
            .map((part) => checker.typeToString(part));
        if (expected.includes('true') && expected.includes('false')) {
            expected.splice(expected.indexOf('true'), 1);
            expected.splice(expected.indexOf('false'), 1);
            expected.push('boolean');
        }
        props.set(prop.name, {
            type: propType,
            required: !(prop.flags & ts.SymbolFlags.Optional),
            boolean: parts.some((part) => part.flags & ts.TypeFlags.BooleanLike),
            expected: expected.join(' | ').slice(0, 200),
        });
    }
    project.props.set(name, props);
    return props;
}

function unwrap(expression) {
    while (expression && ['TSAsExpression', 'TSTypeAssertion', 'TSNonNullExpression', 'TSSatisfiesExpression', 'ParenthesizedExpression'].includes(expression.type)) {
        expression = expression.expression;
    }
    return expression;
}

function literal(expression, undefinedReferences) {
    expression = unwrap(expression);
    if (undefinedReferences.has(expression)) return undefined;
    if (expression?.type === 'Literal') return expression.regex ? unknown : expression.value;
    if (expression?.type === 'TemplateLiteral' && !expression.expressions.length) return expression.quasis[0].value.cooked;
    if (expression?.type === 'ArrayExpression') {
        if (expression.elements.some((element) => element?.type === 'SpreadElement')) return unknown;
        return expression.elements.map((element) => element ? literal(element, undefinedReferences) : undefined);
    }
    if (expression?.type === 'ObjectExpression') {
        const value = Object.create(null);
        for (const property of expression.properties) {
            if (property.type === 'SpreadElement') {
                const spread = literal(property.argument, undefinedReferences);
                if (spread === unknown) return unknown;
                if (spread && typeof spread === 'object') Object.assign(value, spread);
                continue;
            }
            const name = !property.computed && property.key.type === 'Identifier' ? property.key.name : literal(property.key, undefinedReferences);
            if (typeof name !== 'string' || property.kind !== 'init') return unknown;
            value[name] = literal(property.value, undefinedReferences);
        }
        return value;
    }
    if (expression?.type === 'UnaryExpression') {
        if (expression.operator === 'void') return undefined;
        const value = literal(expression.argument, undefinedReferences);
        if (value === unknown) return unknown;
        if (expression.operator === '-' && typeof value === 'number') return -value;
        if (expression.operator === '+' && typeof value === 'number') return value;
        if (expression.operator === '!') return !value;
    }
    if (expression?.type === 'BinaryExpression' && expression.operator === '+') {
        const left = literal(expression.left, undefinedReferences);
        const right = literal(expression.right, undefinedReferences);
        if (['string', 'number'].includes(typeof left) && ['string', 'number'].includes(typeof right)) return left + right;
    }
    return unknown;
}

function accepts(project, type, value) {
    const {ts, checker} = project;
    if (value === unknown || type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return true;
    if (type.flags & ts.TypeFlags.TypeParameter) {
        const constraint = checker.getBaseConstraintOfType(type);
        return !constraint || constraint === type || accepts(project, constraint, value);
    }
    if (type.isUnion()) return type.types.some((part) => accepts(project, part, value));
    if (type.isIntersection()) return type.types.every((part) => accepts(project, part, value));
    if (Array.isArray(value)) {
        if (checker.isTupleType(type)) {
            const elements = checker.getTypeArguments(type);
            const flags = type.target.elementFlags;
            if (value.length < type.target.minLength) return false;
            const rest = flags.findIndex((flag) => flag & ts.ElementFlags.Variable);
            if (rest < 0) return value.length <= elements.length && value.every((item, index) => accepts(project, elements[index], item));
            if (flags[rest] & ts.ElementFlags.Variadic) return true;
            const tail = elements.length - rest - 1;
            return value.every((item, index) => accepts(project,
                elements[index < rest ? index : index >= value.length - tail ? elements.length - (value.length - index) : rest], item));
        }
        if (checker.isArrayType(type)) {
            const elementType = checker.getIndexTypeOfType(type, ts.IndexKind.Number);
            return !elementType || value.every((element) => accepts(project, elementType, element));
        }
        if (!(type.flags & (ts.TypeFlags.Object | ts.TypeFlags.NonPrimitive))) return false;
    }
    if (value !== null && typeof value === 'object') {
        if (type.flags & ts.TypeFlags.NonPrimitive) return true;
        if (!(type.flags & ts.TypeFlags.Object) || checker.isArrayType(type) || checker.isTupleType(type)
            || type.getCallSignatures().length || type.getConstructSignatures().length) return false;
        const declared = checker.getPropertiesOfType(type);
        for (const prop of declared) {
            if (!Object.hasOwn(value, prop.name)) {
                if (!(prop.flags & ts.SymbolFlags.Optional)) return false;
            } else if (!accepts(project, checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration ?? prop.declarations?.[0]), value[prop.name])) return false;
        }
        const stringIndex = checker.getIndexTypeOfType(type, ts.IndexKind.String);
        const numberIndex = checker.getIndexTypeOfType(type, ts.IndexKind.Number);
        return Object.entries(value).every(([name, item]) => {
            const index = stringIndex ?? (String(Number(name)) === name ? numberIndex : undefined);
            return !index || declared.some((prop) => prop.name === name) || accepts(project, index, item);
        });
    }
    const actual = value === null ? checker.getNullType()
        : value === undefined ? checker.getUndefinedType()
            : typeof value === 'string' ? checker.getStringLiteralType(value)
                : typeof value === 'number' ? checker.getNumberLiteralType(value)
                    : typeof value === 'boolean' ? value ? checker.getTrueType() : checker.getFalseType()
                        : typeof value === 'bigint' ? checker.getBigIntLiteralType({negative: value < 0n, base10Value: (value < 0n ? -value : value).toString()})
                        : undefined;
    return !actual || checker.isTypeAssignableTo(actual, type);
}

export function checkProps(context, instance) {
    for (let node = instance.node; node?.type === 'VElement'; node = node.parent) {
        if (node.startTag.attributes.some((attribute) => attribute.directive && attribute.key.name.name === 'pre')) return;
    }
    const sourceCode = context.sourceCode;
    let project = sources.get(sourceCode);
    if (!project) {
        project = readProject(resolve(context.settings.escore?.componentTsconfig ?? defaultConfig));
        sources.set(sourceCode, project);
    }
    const props = readProps(project, instance.entry.name);
    if (!props) return;
    const attributes = new Map();
    let uncertain = false;
    // Template references identify v-for/slot bindings; module scopes identify script bindings.
    const shadowsUndefined = sourceCode.scopeManager.scopes.some((scope) => (
        ['global', 'module'].includes(scope.type) && scope.set.get('undefined')?.defs.length
    ));
    const undefinedReferences = new Set(shadowsUndefined ? [] : instance.node.startTag.attributes
        .flatMap((attribute) => attribute.value?.references ?? [])
        .filter((reference) => reference.id.name === 'undefined' && !reference.variable)
        .map((reference) => reference.id));

    function forgetBindings() {
        // Unknown spreads/computed keys can supply required props or replace earlier values.
        attributes.clear();
        uncertain = true;
    }

    function bindObject(expression) {
        expression = unwrap(expression);
        if (expression?.type !== 'ObjectExpression') {
            const value = literal(expression, undefinedReferences);
            if (value !== null && value !== undefined) forgetBindings();
            return;
        }
        for (const property of expression.properties) {
            if (property.type === 'SpreadElement') {
                bindObject(property.argument);
                continue;
            }
            const name = !property.computed && property.key.type === 'Identifier' ? property.key.name : literal(property.key, undefinedReferences);
            if (typeof name !== 'string') forgetBindings();
            else attributes.set(camelize(name), {value: property.kind === 'init' ? literal(property.value, undefinedReferences) : unknown, node: property});
        }
    }

    for (const attribute of instance.node.startTag.attributes) {
        if (!attribute.directive) {
            attributes.set(camelize(attribute.key.rawName), {value: attribute.value?.value ?? '', node: attribute});
            continue;
        }
        const directive = attribute.key.name.name;
        if (!['bind', 'model'].includes(directive)) continue;
        const argument = attribute.key.argument;
        if (!argument && directive === 'bind') {
            bindObject(attribute.value?.expression);
            continue;
        }
        const name = !argument ? 'modelValue' : argument.type === 'VIdentifier' ? argument.rawName : literal(argument.expression, undefinedReferences);
        if (typeof name !== 'string') forgetBindings();
        else attributes.set(camelize(name), {value: literal(attribute.value?.expression, undefinedReferences), node: attribute});
    }

    for (const [name, prop] of props) {
        const attribute = attributes.get(name);
        if (!attribute) {
            if (prop.required && !uncertain) context.report({
                loc: instance.node.startTag.loc,
                messageId: 'propMissing',
                data: {element: instance.node.rawName, prop: kebab(name)},
            });
            continue;
        }
        let value = attribute.value;
        if (prop.boolean && (value === '' || value === name || value === kebab(name))) value = true;
        if (accepts(project, prop.type, value)) continue;
        context.report({
            node: attribute.node,
            messageId: 'propValue',
            data: {
                element: instance.node.rawName,
                prop: kebab(name),
                expected: prop.expected,
                actual: (JSON.stringify(value, (_, item) => item === unknown ? '(dynamic)' : typeof item === 'bigint' ? `${item}n` : item) ?? String(value)).slice(0, 160),
            },
        });
    }
}
