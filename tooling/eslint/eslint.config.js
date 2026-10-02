import {readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import commentMustHaveBlankLineAbove from './rules/general/comment-must-have-blank-line-above.js';
import allMustNotHaveAriaAttributes from './rules/general/all-must-not-have-aria-attributes.js';
import allMustNotHaveTitleAttribute from './rules/general/all-must-not-have-title-attribute.js';

const generalRules = {
    'comment-must-have-blank-line-above': commentMustHaveBlankLineAbove,
    'all-must-not-have-aria-attributes': allMustNotHaveAriaAttributes,
    'all-must-not-have-title-attribute': allMustNotHaveTitleAttribute,
};

// Component files export rule maps generated from their structure definitions.
const componentDirectory = new URL('./rules/components/', import.meta.url);
const componentFiles = (await readdir(componentDirectory, {withFileTypes: true}))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => entry.name)
    .sort();
const componentRules = {};

for (const file of componentFiles) {
    const {default: rules} = await import(new URL(file, componentDirectory).href);
    for (const [name, rule] of Object.entries(rules)) {
        if (Object.hasOwn(componentRules, name) || Object.hasOwn(generalRules, name)) {
            throw new Error(`Duplicate component rule: ${name} (${file}).`);
        }
        componentRules[name] = rule;
    }
}

const escore = {rules: {...generalRules, ...componentRules}};

const projectDirectory = process.cwd();

const projectRequire = createRequire(join(projectDirectory, 'package.json'));

async function importProjectPackage(packageName) {
    let resolvedPath;

    try {
        resolvedPath = projectRequire.resolve(packageName);
    } catch (cause) {
        throw new Error(
            `Shared ESLint config could not resolve ${packageName} from target project ${projectDirectory}.`,
            {cause}
        );
    }

    try {
        return await import(pathToFileURL(resolvedPath).href);
    } catch (cause) {
        throw new Error(
            `Shared ESLint config could not load ${packageName} from target project ${projectDirectory}.`,
            {cause}
        );
    }
}

function unwrapDefault(module) {
    return module.default ?? module;
}

const stylistic = unwrapDefault(
    await importProjectPackage('@stylistic/eslint-plugin')
);
const vueTsModule = await importProjectPackage('@vue/eslint-config-typescript');
const vueTs = unwrapDefault(vueTsModule);
const defineConfigWithVueTs = vueTsModule.defineConfigWithVueTs ?? vueTs.defineConfigWithVueTs;
const vueTsConfigs = vueTsModule.vueTsConfigs ?? vueTs.vueTsConfigs;
const importModule = await importProjectPackage('eslint-plugin-import-x');
const importPlugin = unwrapDefault(importModule);
const {createTypeScriptImportResolver} = await importProjectPackage('eslint-import-resolver-typescript');
const vue = unwrapDefault(await importProjectPackage('eslint-plugin-vue'));

const controlStatements = [
    'if',
    'return',
    'for',
    'while',
    'do',
    'switch',
    'try',
    'throw'
];
const paddingAroundControl = [
    ...controlStatements.flatMap((stmt) => [
        {blankLine: 'always', prev: '*', next: stmt},
        {blankLine: 'always', prev: stmt, next: '*'}
    ])
];

export default defineConfigWithVueTs(
    vue.configs['flat/essential'],
    vueTsConfigs.recommended,
    {
        plugins: {
            'import-x': importPlugin,
            escore
        },
        settings: {
            'import-x/resolver-next': [
                createTypeScriptImportResolver({
                    alwaysTryTypes: true,
                    project: join(projectDirectory, 'tsconfig.json')
                }),
                importModule.createNodeResolver()
            ]
        },
        rules: {
            ...Object.fromEntries(Object.keys(generalRules).map((name) => [`escore/${name}`, 'error'])),
            'vue/multi-word-component-names': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-expressions': ['error', {allowTernary: true}],
            '@typescript-eslint/consistent-type-imports': [
                'error',
                {
                    prefer: 'type-imports',
                    fixStyle: 'separate-type-imports'
                }
            ],
            'import-x/order': [
                'error',
                {
                    groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index']
                    // alphabetize: { order: 'asc', caseInsensitive: true },
                }
            ],
            'import-x/consistent-type-specifier-style': [
                'error',
                'prefer-top-level'
            ]
        }
    },
    {
        files: ['**/*.vue'],
        plugins: {
            escore
        },
        rules: Object.fromEntries(Object.keys(componentRules).map((name) => [`escore/${name}`, 'error']))
    },
    {
        plugins: {
            '@stylistic': stylistic
        },
        rules: {
            '@stylistic/brace-style': ['error', '1tbs', {allowSingleLine: false}],
            '@stylistic/padding-line-between-statements': [
                'error',
                ...paddingAroundControl,
                {blankLine: 'any', prev: 'if', next: 'if'}
            ]
        }
    },
    {
        ignores: [
            'vendor',
            'node_modules',
            'public',
            'bootstrap/ssr',
            'tailwind.config.js',
            'vite.config.ts',
            'resources/js/actions/**',
            'resources/js/components/ui/*',
            'resources/js/routes/**',
            'resources/js/wayfinder/**',
            'nativephp/**',
        ]
    },
    {
        plugins: {
            '@stylistic': stylistic
        },
        rules: {
            curly: ['error', 'multi-line'],
            '@stylistic/brace-style': ['error', '1tbs', {allowSingleLine: false}]
        }
    }
);
