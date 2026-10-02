import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import test from 'node:test';
import commentMustHaveBlankLineAbove from '../rules/general/comment-must-have-blank-line-above.js';
import allMustNotHaveAriaAttributes from '../rules/general/all-must-not-have-aria-attributes.js';
import allMustNotHaveTitleAttribute from '../rules/general/all-must-not-have-title-attribute.js';
import emptyRules from '../rules/components/empty.js';

const projectRequire = createRequire(join(process.env.STRATA_TEST_PROJECT ?? process.cwd(), 'package.json'));
const {Linter} = projectRequire('eslint');
const vueParser = projectRequire('vue-eslint-parser');
const tsParser = projectRequire('@typescript-eslint/parser');
const ariaRules = {'all-must-not-have-aria-attributes': allMustNotHaveAriaAttributes};
const titleRules = {'all-must-not-have-title-attribute': allMustNotHaveTitleAttribute};
const generalRules = {'comment-must-have-blank-line-above': commentMustHaveBlankLineAbove, ...ariaRules, ...titleRules};

function lint(source, {filename = 'general.js', rules = generalRules, fix = true} = {}) {
    const languageOptions = {ecmaVersion: 'latest', sourceType: 'module'};
    if (filename.endsWith('.vue')) {
        languageOptions.parser = vueParser;
        languageOptions.parserOptions = {parser: tsParser};
    } else if (filename.endsWith('.ts')) {
        languageOptions.parser = tsParser;
    }
    const config = [{
        files: ['**/*.js', '**/*.ts', '**/*.vue'],
        languageOptions,
        plugins: {strata: {rules}},
        rules: Object.fromEntries(Object.keys(rules).map((name) => [`strata/${name}`, 'error'])),
    }];
    const linter = new Linter();
    const result = fix ? linter.verifyAndFix(source, config, {filename}) : {
        output: source,
        fixed: false,
        messages: linter.verify(source, config, {filename}),
    };
    assert.deepEqual(result.messages.filter((message) => message.fatal), [], 'fixes must preserve valid syntax');
    return result;
}

function fixed(source, options) {
    const result = lint(source, options);
    assert.deepEqual(result.messages, []);
    assert.equal(lint(result.output, options).fixed, false, 'fixes must settle');
    return result.output;
}

test('adds a blank line above standalone line, block, and documentation comments', () => {
    for (const comment of ['// Next action', '/* Next action */', '/**\n * Next action\n */']) {
        const source = `const first = 1;\n${comment}\nconst second = 2;`;
        assert.equal(fixed(source), `const first = 1;\n\n${comment}\nconst second = 2;`);
        const messages = lint(source, {fix: false}).messages;
        assert.equal(messages.length, 1);
        assert.equal(messages[0].messageId, 'missing');
        assert.equal(messages[0].message, 'Add a blank line above this comment.');
    }
});

test('comments on the first line also receive a preceding blank line', () => {
    for (const source of ['// First\nconst value = 1;', '/* First */\nconst value = 1;']) {
        assert.equal(fixed(source), '\n' + source);
    }
});

test('every consecutive standalone comment gets its own blank line', () => {
    const source = '// First\n// Second\n/* Third */\nconst value = 1;';
    assert.equal(fixed(source), '\n// First\n\n// Second\n\n/* Third */\nconst value = 1;');
});

test('existing blank lines and indentation are preserved', () => {
    for (const gap of ['\n\n', '\n \t\n', '\n\n\n']) {
        const source = `const first = 1;${gap}  // Second\nconst second = 2;`;
        assert.equal(fixed(source), source);
    }
    assert.equal(fixed('function run() {\n\t// Action\n\treturn 1;\n}'), 'function run() {\n\n\t// Action\n\treturn 1;\n}');
});

test('inline comments are excluded whether code appears before or after them', () => {
    for (const source of [
        'const value = 1; // Inline',
        'const value = /* Inline */ 1;',
        '/* Inline */ const value = 1;',
        'const first = 1;\n/* Inline */ const second = 2;',
        '/* First */ /* Second */\nconst value = 1;',
        'const value = /* Multiline\ncomment */ 1;',
        '/* Multiline\ncomment */ const value = 1;',
    ]) {
        assert.equal(fixed(source), source);
    }
    const source = 'function getValue() {\n    return /* Inline */ 1;\n}';
    const output = fixed(source);
    assert.equal(output, source);
    assert.equal(new Function(`${output}; return getValue();`)(), 1);
});

test('comment-like text inside strings, regular expressions, and templates is ignored', () => {
    const source = 'const a = "// text";\nconst b = `/* text */`;\nconst c = /\\/\\//;';
    assert.equal(fixed(source), source);
});

test('TypeScript comments use the same spacing rule', () => {
    const source = 'type Id = number;\n// Next\nconst id: Id = 1;';
    assert.equal(fixed(source, {filename: 'general.ts'}), 'type Id = number;\n\n// Next\nconst id: Id = 1;');
});

test('Vue document, script, template, and expression comments are checked', () => {
    const source = `<!-- Document -->
<script setup lang="ts">
// Script
const value = 1;
</script>
<template>
<!-- Template -->
<div>{{
    /* Expression */
    value
}}</div>
</template>`;
    const expected = source
        .replace('<!-- Document -->', '\n<!-- Document -->')
        .replace('// Script', '\n// Script')
        .replace('<!-- Template -->', '\n<!-- Template -->')
        .replace('    /* Expression */', '\n    /* Expression */');
    assert.equal(lint(source, {filename: 'general.vue', fix: false}).messages.length, 4);
    assert.equal(fixed(source, {filename: 'general.vue'}), expected);
});

test('inline Vue comments are excluded', () => {
    for (const source of [
        '<template><div><!-- Inline --></div></template>',
        '<template>\n<!-- Inline --><div />\n</template>',
        '<template>\n<div /> <!-- Inline -->\n</template>',
        '<template>\n<div>{{ /* Inline */ 1 }}</div>\n</template>',
    ]) {
        assert.equal(fixed(source, {filename: 'general.vue'}), source);
    }
});

test('CRLF, lone CR, and byte order marks survive fixes', () => {
    for (const newline of ['\r\n', '\r']) {
        const source = `const first = 1;${newline}// Next${newline}const second = 2;`;
        assert.equal(fixed(source), `const first = 1;${newline}${newline}// Next${newline}const second = 2;`);
    }
    const source = '\uFEFF// First\nconst value = 1;';
    assert.equal(fixed(source), '\uFEFF\n// First\nconst value = 1;');
});

test('generated comments and component blank lines settle with the general rule', () => {
    const source = `<template>
<Empty>
    <EmptyHeader>
        <EmptyTitle>No results</EmptyTitle>
        <EmptyDescription>Try again</EmptyDescription>
    </EmptyHeader>
    <!-- Actions -->
    <EmptyContent><Button /></EmptyContent>
</Empty>
</template>`;
    const output = fixed(source, {filename: 'general.vue', rules: {...emptyRules, ...generalRules}});
    assert.ok(output.includes('<template>\n\n<!-- No results -->\n<Empty>'));
    assert.ok(output.includes('</EmptyHeader>\n\n    <!-- Actions -->\n    <EmptyContent>'));
});

const ariaOptions = {filename: 'aria.vue', rules: ariaRules};
const markup = (content) => `<template>\n${content}\n</template>`;
const fixAria = (content) => fixed(markup(content), ariaOptions);

test('ARIA attributes are removed from every native element and component', () => {
    for (const element of ['div', 'button', 'input', 'svg', 'span', 'Button', 'Empty', 'CustomComponent']) {
        const result = fixAria(`<${element} id="keep" aria-label="Name" aria-hidden="true" />`);
        assert.equal(result, markup(`<${element} id="keep" />`));
    }
    assert.equal(fixAria('<div ARIA-LABEL="Name" aria-description="Text" aria-unknown="x">Keep</div>'), markup('<div>Keep</div>'));
    assert.equal(fixAria('<div aria-hidden aria- />'), markup('<div />'));
});

test('the ARIA diagnostic identifies the attribute and owning element', () => {
    const result = lint(markup('<Button aria-label="Name" />'), {...ariaOptions, fix: false});
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].ruleId, 'strata/all-must-not-have-aria-attributes');
    assert.equal(result.messages[0].message, 'Remove aria-label from <Button>; aria-* attributes are forbidden.');
});

test('ARIA bindings, modifiers, and statically known computed arguments are removed', () => {
    for (const attribute of [
        ':aria-label="label"',
        'v-bind:aria-hidden="hidden"',
        ':aria-describedby.camel="description"',
        'v-bind:aria-hidden.prop="hidden"',
        ':[\'aria-label\']="label"',
        ':[`aria-label`]="label"',
        ':[\'aria-\'+\'label\']="label"',
        ':[\'aria-\'+kind]="value"',
        ':[`aria-${kind}`]="value"',
    ]) {
        assert.equal(fixAria(`<Button ${attribute} :class="classes" />`), markup('<Button :class="classes" />'), attribute);
    }
});

test('ARIA attribute removal preserves neighboring bindings, contents, and line endings', () => {
    const source = markup('<Button\r\n    :class="classes"\r\n    aria-label="Name"\r\n    @click="save"\r\n>Keep {{ label }}</Button>').replace(/(?<!\r)\n/g, '\r\n');
    const result = fixed(source, ariaOptions);
    assert.ok(result.includes(':class="classes"\r\n    @click="save"'));
    assert.ok(result.includes('Keep {{ label }}</Button>'));
    assert.equal(result.replaceAll('\r\n', '').includes('\n'), false);
});

test('v-bind object properties are removed without damaging commas or other values', () => {
    for (const object of [
        "{ 'aria-label': 'Name' }",
        "{ 'aria-label': 'Name', }",
        "{ 'aria-label': 'Name', id: 'keep' }",
        "{ id: 'keep', 'aria-label': 'Name' }",
        "{ id: 'keep', 'aria-label': 'Name', title: 'Stay' }",
        "{ 'aria-label': 'Name', 'aria-hidden': true, id: 'keep', 'aria-busy': false }",
    ]) {
        const output = fixAria(`<Button v-bind="${object}" />`);
        const expression = output.match(/v-bind="([^"]*)"/)[1];
        const original = new Function(`return (${object});`)();
        const actual = new Function(`return (${expression});`)();
        const expected = Object.fromEntries(Object.entries(original).filter(([key]) => !key.startsWith('aria-')));
        assert.deepEqual(actual, expected);
    }
});

test('computed ARIA object keys and TypeScript wrappers cannot bypass the rule', () => {
    for (const expression of [
        "{ ['aria-label']: label, id: 'keep' }",
        "{ ['aria-' + 'label']: label, id: 'keep' }",
        "{ ['aria-' + kind]: value, id: 'keep' }",
        "{ [`aria-${kind}`]: value, id: 'keep' }",
        "({ 'ARIA-LABEL': label, id: 'keep' } as Record<string, unknown>)",
        "({ 'aria-label': label, id: 'keep' } satisfies Record<string, unknown>)",
    ]) {
        const output = fixAria(`<Button v-bind="${expression}" />`);
        assert.doesNotMatch(output, /aria-/i);
        assert.ok(output.includes("id: 'keep'"));
    }
});

test('known ARIA keys in inline spreads and conditional objects are removed', () => {
    for (const expression of [
        "{ ...{ 'aria-label': label }, id: 'keep' }",
        "{ ...(enabled ? { 'aria-hidden': true } : { 'aria-busy': false }), id: 'keep' }",
        "enabled ? { 'aria-label': label, id: 'keep' } : { 'aria-description': description, id: 'keep' }",
        "enabled && { 'aria-label': label, id: 'keep' }",
        "attrs || { 'aria-label': label, id: 'keep' }",
    ]) {
        const output = fixAria(`<Button v-bind="${expression}" />`);
        assert.doesNotMatch(output, /aria-/i);
        assert.ok(output.includes("id: 'keep'"));
    }
});

test('object property fixes preserve surrounding comments', () => {
    const source = '<Button v-bind="{ /* before */ \'aria-label\': label /* after */, /* id */ id: \'keep\' }" />';
    const output = fixAria(source);
    assert.doesNotMatch(output, /aria-/);
    for (const text of ['/* before */', '/* after */', '/* id */', "id: 'keep'"]) assert.ok(output.includes(text));
});

test('many consecutive ARIA properties are removed in a stable fix', () => {
    const properties = Array.from({length: 16}, (_, index) => `'aria-${index}': ${index}`).join(', ');
    const output = fixAria(`<Button v-bind="{ ${properties}, id: 'keep' }" />`);
    assert.doesNotMatch(output, /aria-/);
    assert.ok(output.includes("id: 'keep'"));
});

test('unrelated names, text, event listeners, and nested class keys are preserved', () => {
    for (const content of [
        '<Button title="aria-label" data-aria-label="Keep" aria="Keep">aria-hidden</Button>',
        '<Button @aria-change="changed" :variant="variant" />',
        '<Button v-bind="attrs" :[attribute]="value" />',
        '<Button v-bind="{ class: { \'aria-label\': true }, title: \'aria-hidden\' }" />',
    ]) {
        assert.equal(fixAria(content), markup(content));
    }
});

test('the ARIA rule safely ignores JavaScript without a Vue template parser', () => {
    const source = "const data = { 'aria-label': 'This is data, not a template attribute' };";
    assert.equal(fixed(source, {rules: ariaRules}), source);
});

const titleOptions = {filename: 'title.vue', rules: titleRules};

test('title attributes are removed from native elements and components', () => {
    for (const element of ['div', 'button', 'input', 'svg', 'Button', 'Empty', 'CustomComponent']) {
        for (const attribute of ['title="Name"', 'TITLE="Name"', 'title']) {
            assert.equal(fixed(markup(`<${element} id="keep" ${attribute} />`), titleOptions), markup(`<${element} id="keep" />`));
        }
    }
    const source = markup('<Button\r\n    :class="classes"\r\n    title="Name"\r\n    @click="save"\r\n>Keep {{ label }}</Button>');
    assert.equal(fixed(source, titleOptions), source.replace('\r\n    title="Name"', ''));
    const result = lint(markup('<Button title="Name" />'), {...titleOptions, fix: false});
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].ruleId, 'strata/all-must-not-have-title-attribute');
    assert.equal(result.messages[0].message, 'Remove title from <Button>; title attributes are forbidden.');
});

test('title bindings, modifiers, and known computed arguments are removed', () => {
    for (const attribute of [
        ':title="label"',
        'v-bind:title="label"',
        ':title.camel="label"',
        'v-bind:title.prop="label"',
        ':[\'title\']="label"',
        ':[`title`]="label"',
        ':[\'ti\'+\'tle\']="label"',
    ]) {
        assert.equal(fixed(markup(`<Button ${attribute} :class="classes" />`), titleOptions), markup('<Button :class="classes" />'), attribute);
    }
});

test('title object properties are removed without damaging commas or other values', () => {
    for (const object of [
        "{ title: 'Name' }",
        "{ title: 'Name', }",
        "{ title: 'Name', id: 'keep' }",
        "{ id: 'keep', title: 'Name' }",
        "{ id: 'keep', title: 'Name', class: 'stay' }",
        "{ title: 'Name', TITLE: 'Other', ['ti' + 'tle']: 'Computed', id: 'keep' }",
    ]) {
        const output = fixed(markup(`<Button v-bind="${object}" />`), titleOptions);
        const expression = output.match(/v-bind="([^"]*)"/)[1];
        const original = new Function(`return (${object});`)();
        const actual = new Function(`return (${expression});`)();
        const expected = Object.fromEntries(Object.entries(original).filter(([key]) => key.toLowerCase() !== 'title'));
        assert.deepEqual(actual, expected);
    }
});

test('computed title keys, shorthand properties, and TypeScript wrappers are checked', () => {
    for (const expression of [
        "{ title, id: 'keep' }",
        "{ ['title']: label, id: 'keep' }",
        "{ [`title`]: label, id: 'keep' }",
        "{ ['ti' + 'tle']: label, id: 'keep' }",
        "({ title: label, id: 'keep' } as Record<string, unknown>)",
        "({ title: label, id: 'keep' } satisfies Record<string, unknown>)",
    ]) {
        const output = fixed(markup(`<Button v-bind="${expression}" />`), titleOptions);
        assert.doesNotMatch(output, /title|label|'ti'/i);
        assert.ok(output.includes("id: 'keep'"));
    }
});

test('known title keys in inline spreads and conditional objects are removed', () => {
    for (const expression of [
        "{ ...{ title: label }, id: 'keep' }",
        "{ ...(enabled ? { title: label } : { TITLE: other }), id: 'keep' }",
        "enabled ? { title: label, id: 'keep' } : { title: other, id: 'keep' }",
        "enabled && { title: label, id: 'keep' }",
        "attrs || { title: label, id: 'keep' }",
    ]) {
        const output = fixed(markup(`<Button v-bind="${expression}" />`), titleOptions);
        assert.doesNotMatch(output, /title/i);
        assert.ok(output.includes("id: 'keep'"));
    }
    const source = markup('<Button v-bind="{ /* before */ title: label /* after */, /* id */ id: \'keep\' }" />');
    const output = fixed(source, titleOptions);
    assert.doesNotMatch(output, /title/);
    for (const text of ['/* before */', '/* after */', '/* id */', "id: 'keep'"]) assert.ok(output.includes(text));
});

test('the title ban preserves unrelated names, values, events, and unknown bindings', () => {
    for (const content of [
        '<Button subtitle="Keep" data-title="Keep" title-extra="Keep">title</Button>',
        '<Button @title="changed" :subtitle="title" />',
        '<Button :[attribute]="value" :[\'title-\'+kind]="value" />',
        '<Button v-bind="attrs" />',
        '<Button v-bind="{ class: { title: true }, id: \'title\', [attribute]: value, [\'title-\' + kind]: value }" />',
        '<svg><title>Keep text</title></svg>',
    ]) {
        assert.equal(fixed(markup(content), titleOptions), markup(content));
    }
    const source = 'const data = { title: "This is data" };';
    assert.equal(fixed(source, {rules: titleRules}), source);
});

test('title and ARIA removals settle together with component and comment fixes', () => {
    const source = markup(`<Empty title="Name" aria-label="Name">
    <EmptyHeader>
        <EmptyTitle v-bind="{ title: label, 'aria-hidden': true, id: 'keep' }">No results</EmptyTitle>
        <EmptyDescription>Try again</EmptyDescription>
    </EmptyHeader>
</Empty>`);
    const output = fixed(source, {filename: 'combined.vue', rules: {...emptyRules, ...generalRules}});
    assert.ok(output.includes('<template>\n\n<!-- No results -->\n<Empty>'));
    assert.doesNotMatch(output, /title[=:]|aria-/);
    assert.ok(output.includes("id: 'keep'"));
});
