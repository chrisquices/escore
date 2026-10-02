import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {after, test} from 'node:test';
import createComponentRules from '../helpers/create-component-rules.js';
import accordionRules from '../rules/components/accordion.js';
import sheetRules from '../rules/components/sheet.js';

const projectRequire = createRequire(join(process.env.STRATA_TEST_PROJECT ?? process.cwd(), 'package.json'));
const libraryRequire = createRequire(new URL('../../../packages/js/package.json', import.meta.url));
const {Linter} = projectRequire('eslint');
const parser = projectRequire('vue-eslint-parser');
const tsParser = projectRequire('@typescript-eslint/parser');

function lint(content, {name = 'Accordion', componentTsconfig, rules, fix = false, script = ''} = {}) {
    rules ??= createComponentRules([{[name]: {flags: ['required']}}]);
    const ruleId = `${name.toLowerCase()}-must-have-valid-props`;
    const config = [{
        files: ['**/*.vue'],
        languageOptions: {parser, parserOptions: {parser: tsParser}, ecmaVersion: 'latest', sourceType: 'module'},
        settings: {strata: {componentTsconfig}},
        plugins: {strata: {rules}},
        rules: {[`strata/${ruleId}`]: 'error'},
    }];
    const input = `${script ? `<script setup lang="ts">${script}</script>\n` : ''}<template>\n${content}\n</template>`;
    const linter = new Linter();
    const result = fix ? linter.verifyAndFix(input, config, {filename: 'props.vue'})
        : {messages: linter.verify(input, config, {filename: 'props.vue'}), output: input};
    assert.deepEqual(result.messages.filter((message) => message.fatal), []);
    return result;
}

test('required inherited props are read from AccordionItem source for every repeated item', () => {
    const result = lint('<Accordion><AccordionItem value="first" /><AccordionItem /><AccordionItem /></Accordion>', {rules: accordionRules});
    assert.equal(result.messages.length, 2);
    assert.ok(result.messages.every((message) => message.messageId === 'propMissing' && message.message.includes('value')));
    assert.deepEqual(lint('<AccordionItem value="" />', {name: 'AccordionItem'}).messages, [], 'source string types do not imply a nonempty-string policy');
});

test('Sheet requires a boolean open prop from its source and accepts controlled bindings', () => {
    const options = {name: 'Sheet', rules: sheetRules};
    for (const content of ['<Sheet />', '<Sheet default-open />']) {
        const result = lint(content, options);
        assert.deepEqual(result.messages.map((message) => message.messageId), ['propMissing']);
        assert.equal(result.messages[0].message, 'Add the required open prop to <Sheet>; its component source requires it.');
    }
    for (const binding of ['v-model:open="isOpen"', ':open="isOpen" @update:open="isOpen = $event"', ':open="false"', ':open="true"']) {
        assert.deepEqual(lint(`<Sheet ${binding} />`, options).messages, []);
    }
    for (const value of ['null', 'undefined', "'false'", '1']) {
        assert.deepEqual(lint(`<Sheet :open="${value}" />`, options).messages.map((message) => message.messageId), ['propValue']);
    }
});

test('literal unions and booleans are validated without copying the prop list', () => {
    const result = lint('<Accordion type="sometimes" orientation="diagonal" dir="up" collapsible="yes" />');
    assert.equal(result.messages.length, 4);
    assert.ok(result.messages.every((message) => message.messageId === 'propValue'));
    assert.match(result.messages[0].message, /"single".*"multiple"|"multiple".*"single"/);
    assert.deepEqual(lint('<Accordion type="single" orientation="horizontal" dir="rtl" collapsible disabled="" :unmount-on-hide="false" />').messages, []);
    assert.deepEqual(lint('<Accordion />').messages, [], 'source-optional props remain optional');
});

test('camelCase, kebab-case, bound literals, computed names, and binding modifiers work', () => {
    for (const attribute of [
        ':unmountOnHide="false"', ':unmount-on-hide="false"', ':disabled.prop="false"',
        ':[\'type\']="\'single\'"', ':[`type`]="\'multiple\'"', ':type="(\'single\' as const)"',
    ]) assert.deepEqual(lint(`<Accordion ${attribute} />`).messages, []);
    assert.equal(lint('<Accordion :[\'type\']="\'bad\'" />').messages.length, 1);
    assert.equal(lint('<Accordion :unmountOnHide="\'false\'" />').messages.length, 1);
});

test('array contents and scalar types follow the source declaration', () => {
    assert.deepEqual(lint('<Accordion type="multiple" :model-value="[\'a\', \'b\']" />').messages, []);
    assert.equal(lint('<Accordion :model-value="[\'a\', 2]" />').messages.length, 1);
    assert.equal(lint('<Accordion :model-value="[1n, 2]" />').messages.length, 1);
    assert.equal(lint('<Accordion :model-value="[dynamicValue, 2]" />').messages.length, 1);
    assert.deepEqual(lint('<Accordion :model-value="[dynamicValue, \'b\']" />').messages, []);
    assert.equal(lint('<AccordionItem :value="42" />', {name: 'AccordionItem'}).messages.length, 1);
    assert.equal(lint('<Accordion :type="{}" />').messages.length, 1);
});

test('normal attributes, events, and unresolved dynamic values are left alone', () => {
    assert.deepEqual(lint('<Accordion id="faq" class="w-full" :class="{active}" :style="styles" data-test="faq" custom-attribute="ok" @update:model-value="save" v-model="selected" :type="mode" v-show="visible" />').messages, []);
    assert.deepEqual(lint('<AccordionItem :value="item.id" />', {name: 'AccordionItem'}).messages, []);
    assert.equal(lint('<AccordionItem @value="save" />', {name: 'AccordionItem'}).messages[0].messageId, 'propMissing');
});

test('v-bind objects provide required props and preserve override order', () => {
    assert.deepEqual(lint('<AccordionItem v-bind="{ value: \'first\' }" />', {name: 'AccordionItem'}).messages, []);
    assert.deepEqual(lint('<AccordionItem v-bind="({ ...{ value: \'first\' } } as const)" />', {name: 'AccordionItem'}).messages, []);
    assert.equal(lint('<AccordionItem v-bind="{ disabled: true }" />', {name: 'AccordionItem'}).messages[0].messageId, 'propMissing');
    assert.equal(lint('<Accordion v-bind="{ type: \'bad\' }" />').messages.length, 1);
    assert.deepEqual(lint('<Accordion v-bind="{ type: \'bad\' }" type="single" />').messages, []);
    assert.equal(lint('<Accordion type="single" v-bind="{ type: \'bad\' }" />').messages.length, 1);
    assert.deepEqual(lint('<Accordion v-bind="{ type: \'bad\', ...attrs }" />').messages, []);
    assert.equal(lint('<Accordion v-bind="{ ...attrs, type: \'bad\' }" />').messages.length, 1);
});

test('unknown object bindings and computed names do not produce false missing-prop reports', () => {
    for (const attribute of ['v-bind="attrs"', 'v-bind="{ ...attrs }"', 'v-bind="enabled ? first : second"', ':[propName]="value"']) {
        assert.deepEqual(lint(`<AccordionItem ${attribute} />`, {name: 'AccordionItem'}).messages, []);
    }
    assert.deepEqual(lint('<Accordion type="bad" v-bind="attrs" />').messages, []);
    assert.equal(lint('<Accordion v-bind="attrs" type="bad" />').messages.length, 1);
    assert.equal(lint('<AccordionItem v-bind="null" />', {name: 'AccordionItem'}).messages[0].messageId, 'propMissing');
});

test('explicit undefined is checked against source prop types, including nested literals', () => {
    const options = {name: 'CodeBlock', fix: true};
    for (const expression of ['undefined', '(undefined as string)', 'void 0', 'void dynamicValue']) {
        const markup = `<CodeBlock :code="${expression}" />`;
        const result = lint(markup, options);
        assert.deepEqual(result.messages.map((message) => message.message), ['Set code on <CodeBlock> to string; received undefined.']);
        assert.equal(result.fixed, false);
        assert.equal(result.output, `<template>\n${markup}\n</template>`);
    }
    assert.deepEqual(lint('<CodeBlock code="valid" :file-name="undefined" :language="undefined" />', options).messages, []);
    assert.equal(lint('<AccordionItem :value="undefined" />', {name: 'AccordionItem'}).messages[0].messageId, 'propValue');
    assert.equal(lint('<Accordion :model-value="[undefined]" />').messages[0].messageId, 'propValue');
});

test('undefined object bindings supply no props and preserve binding precedence', () => {
    const options = {name: 'CodeBlock'};
    for (const binding of ['undefined', '{ ...undefined }', 'void unknownValue']) {
        assert.deepEqual(lint(`<CodeBlock v-bind="${binding}" />`, options).messages.map((message) => message.messageId), ['propMissing']);
        assert.deepEqual(lint(`<CodeBlock code="valid" v-bind="${binding}" />`, options).messages, []);
    }
    assert.deepEqual(lint('<CodeBlock v-bind="{ code: undefined }" />', options).messages.map((message) => message.messageId), ['propValue']);
    assert.deepEqual(lint('<CodeBlock v-bind="{ code: undefined, ...attrs }" />', options).messages, []);
    assert.deepEqual(lint('<CodeBlock v-bind="{ ...attrs, code: undefined }" />', options).messages.map((message) => message.messageId), ['propValue']);
    assert.deepEqual(lint('<CodeBlock v-bind="{ code: undefined }" code="valid" />', options).messages, []);
    assert.deepEqual(lint('<CodeBlock v-bind="{ ...attrs, ...undefined }" />', options).messages, []);
});

test('local bindings named undefined remain unknown to literal prop validation', () => {
    const options = {name: 'CodeBlock'};
    for (const markup of [
        '<CodeBlock v-for="undefined in values" :code="undefined" />',
        '<Wrapper v-slot="{ undefined }"><CodeBlock :code="undefined" /></Wrapper>',
        '<Wrapper v-slot="{ undefined }"><CodeBlock v-bind="undefined" /></Wrapper>',
    ]) assert.deepEqual(lint(markup, options).messages, []);
    for (const markup of ['<CodeBlock :code="undefined" />', '<CodeBlock v-bind="{ code: undefined }" />', '<CodeBlock v-bind="undefined" />']) {
        assert.deepEqual(lint(markup, {...options, script: 'const undefined = "source";'}).messages, []);
    }
    assert.deepEqual(lint('<CodeBlock :code="nullableCode" />', {...options, script: 'const nullableCode = null;'}).messages, [], 'variable types are checked by vue-tsc');
    assert.deepEqual(lint('<CodeBlock v-bind="emptyProps" />', {...options, script: 'const emptyProps = {};'}).messages, [], 'variable bindings are checked by vue-tsc');
});

test('prop violations have no guessed fixes', () => {
    const content = '<Accordion type="bad"><AccordionItem /></Accordion>';
    const result = lint(content, {rules: accordionRules, fix: true});
    assert.equal(result.fixed, false);
    assert.equal(result.output, `<template>\n${content}\n</template>`);
    assert.deepEqual(result.messages.map((message) => message.messageId), ['propValue', 'propMissing']);
});

const directory = mkdtempSync(join(tmpdir(), 'strata-props-'));
const componentTsconfig = join(directory, 'tsconfig.json');
after(() => rmSync(directory, {recursive: true, force: true}));
writeFileSync(componentTsconfig, JSON.stringify({
    compilerOptions: {
        strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', skipLibCheck: true,
        paths: {vue: [join(dirname(libraryRequire.resolve('vue/package.json')), 'dist/vue.d.ts')]},
    },
    include: ['*.vue', '*.ts'],
}));
writeFileSync(join(directory, 'types.ts'), `
export interface BaseProps { label: string }
export type Mode = 'small' | 'large';
export interface Details { enabled: boolean }
`);
writeFileSync(join(directory, 'Probe.vue'), `<script setup lang="ts">
import type {BaseProps, Mode, Details} from './types';
interface Props extends BaseProps {
    mode?: Mode;
    count?: number;
    message?: string;
    details?: Details;
    range?: [number, number];
    payload?: {};
    counts?: {[key: number]: number};
}
withDefaults(defineProps<Props>(), {message: 'Default text', count: 2});
</script><template><div /></template>`);
writeFileSync(join(directory, 'RuntimeProbe.vue'), `<script setup lang="ts">
import type {PropType} from 'vue';
defineProps({
    label: {type: String, required: true},
    count: {type: Number, default: 2},
    mode: String as PropType<'small' | 'large'>,
    disabled: Boolean,
});
</script><template><div /></template>`);
writeFileSync(join(directory, 'ModelProbe.vue'), `<script setup lang="ts">
defineModel<string>({required: true});
defineModel<number>('count');
</script><template><div /></template>`);
writeFileSync(join(directory, 'GenericProbe.vue'), `<script setup lang="ts" generic="T extends string">
defineProps<{value: T}>();
</script><template><div /></template>`);

test('imported interfaces, withDefaults, and runtime prop declarations share source validation', () => {
    for (const name of ['Probe', 'RuntimeProbe']) {
        const options = {name, componentTsconfig};
        assert.deepEqual(lint(`<${name} label="Hello" />`, options).messages, [], 'defaults and optional props need no attribute');
        assert.deepEqual(lint(`<${name} />`, options).messages.map((message) => message.messageId), ['propMissing']);
        assert.deepEqual(lint(`<${name} label="Hello" :count="3" mode="small" />`, options).messages, []);
        assert.equal(lint(`<${name} label="Hello" count="3" mode="wrong" />`, options).messages.length, 2);
    }
});

test('known object and tuple values follow imported types', () => {
    const options = {name: 'Probe', componentTsconfig};
    assert.deepEqual(lint('<Probe label="Hello" :details="{enabled: true}" :range="[1, 2]" />', options).messages, []);
    assert.equal(lint('<Probe label="Hello" :details="{enabled: \'yes\'}" />', options).messages.length, 1);
    assert.equal(lint('<Probe label="Hello" :details="{}" />', options).messages.length, 1);
    assert.equal(lint('<Probe label="Hello" :range="[1]" />', options).messages.length, 1);
    assert.deepEqual(lint('<Probe label="Hello" :payload="[]" :counts="[1, 2]" />', options).messages, []);
    assert.equal(lint('<Probe label="Hello" :counts="[\'wrong\']" />', options).messages.length, 1);
});

test('v-model satisfies required model props declared in the component source', () => {
    const options = {name: 'ModelProbe', componentTsconfig};
    assert.equal(lint('<ModelProbe />', options).messages[0].messageId, 'propMissing');
    assert.deepEqual(lint('<ModelProbe v-model="selected" v-model:count="count" />', options).messages, []);
    assert.equal(lint('<ModelProbe :model-value="42" />', options).messages.length, 1);
});

test('generic components retain their required props and type constraints', () => {
    const options = {name: 'GenericProbe', componentTsconfig};
    assert.deepEqual(lint('<GenericProbe value="hello" />', options).messages, []);
    assert.equal(lint('<GenericProbe />', options).messages[0].messageId, 'propMissing');
    assert.equal(lint('<GenericProbe :value="42" />', options).messages[0].messageId, 'propValue');
});

test('v-pre content is not checked as a live Vue component', () => {
    assert.deepEqual(lint('<Accordion v-pre type="wrong" />').messages, []);
    assert.deepEqual(lint('<div v-pre><Accordion type="wrong" /></div>').messages, []);
});

test('editing imported source types refreshes validation in the same process', () => {
    const path = join(directory, 'types.ts');
    const original = readFileSync(path, 'utf8');
    const options = {name: 'Probe', componentTsconfig};
    assert.deepEqual(lint('<Probe label="Hello" mode="small" />', options).messages, []);
    try {
        writeFileSync(path, original.replace("'small' | 'large'", "'wide'"));
        assert.equal(lint('<Probe label="Hello" mode="small" />', options).messages.length, 1);
        assert.deepEqual(lint('<Probe label="Hello" mode="wide" />', options).messages, []);
    } finally {
        writeFileSync(path, original);
    }
});

test('unresolved source imports fail explicitly instead of silently accepting props', () => {
    const path = join(directory, 'BrokenProbe.vue');
    writeFileSync(path, '<script setup lang="ts">import type {Props} from "./missing"; defineProps<Props>();</script><template><div /></template>');
    try {
        assert.throws(() => lint('<BrokenProbe />', {name: 'BrokenProbe', componentTsconfig}), /Cannot resolve prop source.*missing/s);
    } finally {
        rmSync(path);
    }
});
