import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import test from 'node:test';
import createComponentRules from '../helpers/create-component-rules.js';
import emptyRules from '../rules/components/empty.js';

// Dependencies belong to the consuming project, as they do in eslint.config.js.
const projectDirectory = process.env.ESCORE_TEST_PROJECT ?? process.cwd();
const projectRequire = createRequire(join(projectDirectory, 'package.json'));
const {Linter} = projectRequire('eslint');
const parser = projectRequire('vue-eslint-parser');

const template = (content) => `<template>\n${content}\n</template>`;
const header = (title = 'No results', description = 'Try another search') => `<EmptyHeader>
    <EmptyTitle>${title}</EmptyTitle>
    <EmptyDescription>${description}</EmptyDescription>
</EmptyHeader>`;
const empty = (content = '', heading = header()) => template(`<!-- No results -->
<Empty>
${heading}${content}
</Empty>`);
const entry = (name, children, flags = ['required']) => ({[name]: {
    flags,
    ...(children === undefined ? {} : {children}),
}});
const blank = () => entry('BlankLine');
const comment = () => entry('Comment');
const source = (name, flags = ['required']) => entry(name, undefined, [...flags, 'comment-source']);

function lint(sourceCode, {rules = emptyRules, only, fix = false} = {}) {
    const enabled = only ?? Object.keys(rules);
    for (const name of enabled) {
        assert.ok(Object.hasOwn(rules, name), `Unknown test rule: ${name}`);
    }
    const config = [{
        files: ['**/*.vue'],
        languageOptions: {parser, ecmaVersion: 'latest', sourceType: 'module'},
        plugins: {escore: {rules}},
        rules: Object.fromEntries(enabled.map((name) => [`escore/${name}`, 'error'])),
    }];
    const linter = new Linter();
    const result = fix
        ? linter.verifyAndFix(sourceCode, config, {filename: 'component.vue'})
        : {messages: linter.verify(sourceCode, config, {filename: 'component.vue'}), output: sourceCode, fixed: false};
    assert.deepEqual(result.messages.filter((message) => message.fatal), [], 'markup must remain parseable');
    return result;
}

function fixed(sourceCode, options = {}) {
    const result = lint(sourceCode, {...options, fix: true});
    assert.deepEqual(result.messages, []);
    assert.equal(lint(result.output, {...options, fix: true}).fixed, false, 'fixes must settle');
    return result.output;
}

test('valid Empty, optional media/content, and unrestricted leaf content', () => {
    assert.deepEqual(lint(empty()).messages, []);
    assert.deepEqual(lint(empty('\n\n<EmptyContent><Button><Icon /> Search</Button></EmptyContent>')).messages, []);
    const mediaHeader = header().replace('<EmptyHeader>', '<EmptyHeader>\n<EmptyMedia><Icon /></EmptyMedia>');
    assert.deepEqual(lint(empty('', mediaHeader)).messages, []);
    assert.deepEqual(lint(template('<div><Button /></div>')).messages, [], 'family does not require Empty in every file');
});

test('missing optional parent does not require its children; present parent does', () => {
    const result = lint(empty('\n\n<EmptyContent />'));
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].ruleId, 'escore/empty-must-have-required-children');
    assert.match(result.messages[0].message, /missing direct <Button> child inside <EmptyContent>/);
    assert.equal(lint(empty('\n\n<EmptyContent />'), {fix: true}).fixed, false);
});

test('wrappers cannot satisfy direct children and unexpected text is rejected', () => {
    const result = lint(empty('', `<div>${header()}</div>`), {only: ['empty-must-have-required-children', 'empty-must-not-have-extra-children']});
    assert.deepEqual(result.messages.map((message) => message.messageId).sort(), ['missing', 'unexpected']);
    for (const content of ['loose text', '{{ value }}', '<Wrong />']) {
        const messages = lint(empty(`\n${content}`), {only: ['empty-must-not-have-extra-children']}).messages;
        assert.equal(messages.length, 1);
        assert.equal(messages[0].messageId, 'unexpected');
    }
});

test('wrong order is separate from existence and is never automatically moved', () => {
    const reversed = header().replace(/(<EmptyTitle>.*<\/EmptyTitle>)\n    (<EmptyDescription>.*<\/EmptyDescription>)/, '$2\n    $1');
    const result = lint(empty('', reversed), {fix: true});
    assert.deepEqual(result.messages.map((message) => message.messageId), ['order']);
    assert.equal(result.fixed, false);
});

test('duplicate components are matched by occurrence and extra occurrences are reported', () => {
    const rules = createComponentRules([entry('Panel', [
        entry('Section', [entry('Title')]),
        entry('Section', [entry('Button')]),
    ])]);
    assert.deepEqual(lint(template('<Panel><Section><Title /></Section><Section><Button /></Section></Panel>'), {rules}).messages, []);
    const wrong = lint(template('<Panel><Section><Button /></Section><Section><Title /></Section></Panel>'), {rules});
    assert.equal(wrong.messages.filter((message) => message.messageId === 'missing').length, 2);
    assert.equal(wrong.messages.filter((message) => message.messageId === 'unexpected').length, 2);
    const extra = lint(template('<Panel><Section><Title /></Section><Section><Button /></Section><Section /></Panel>'), {rules});
    assert.deepEqual(extra.messages.map((message) => message.messageId), ['unexpected']);
});

test('optional repeated names reserve occurrences for required entries', () => {
    const rules = createComponentRules([entry('Panel', [
        entry('Button', undefined, ['optional']),
        entry('Button'),
    ])]);
    for (const contents of ['<Button />', '<Button /><Button />']) {
        assert.deepEqual(lint(template(`<Panel>${contents}</Panel>`), {rules}).messages, []);
    }
    assert.equal(lint(template('<Panel />'), {rules}).messages.length, 1);
});

test('matching supports kebab components without confusing Button and native button', () => {
    const kebab = empty().replaceAll('EmptyHeader', 'empty-header').replaceAll('EmptyTitle', 'empty-title').replaceAll('EmptyDescription', 'empty-description');
    assert.deepEqual(lint(kebab).messages, []);
    const result = lint(empty('\n\n<EmptyContent><button /></EmptyContent>'));
    assert.deepEqual(result.messages.map((message) => message.messageId).sort(), ['missing', 'unexpected']);
});

test('multiple roots and nested family roots are checked separately', () => {
    const sourceCode = template(`<!-- No results -->
<Empty>${header()}</Empty>
<!-- No results -->
<Empty>${header()}\n\n<EmptyContent /></Empty>`);
    assert.deepEqual(lint(sourceCode).messages.map((message) => message.messageId), ['missing']);
    const nested = empty('', header('<Empty />'));
    const result = lint(nested, {only: ['empty-must-have-required-children']});
    assert.equal(result.messages.length, 1);
    assert.match(result.messages[0].message, /missing direct <EmptyHeader> child inside <Empty>/);
});

test('blank lines are fixed only between existing entries', () => {
    const content = '<EmptyContent><Button /></EmptyContent>';
    for (const separator of ['\n', '\n\n\n', '\n\n\n\n']) {
        assert.equal(fixed(empty(separator + content)), empty('\n\n' + content));
    }
    assert.equal(fixed(empty()), empty());
});

test('multiple BlankLine entries remain distinct and collapse across absent optional entries', () => {
    const rules = createComponentRules([entry('Panel', [
        entry('Header'), blank(), entry('Body', undefined, ['optional']), blank(), entry('Footer'),
    ])]);
    assert.equal(fixed(template('<Panel>\n<Header />\n<Body />\n<Footer />\n</Panel>'), {rules}), template('<Panel>\n<Header />\n\n<Body />\n\n<Footer />\n</Panel>'));
    assert.equal(fixed(template('<Panel>\n<Header />\n<Footer />\n</Panel>'), {rules}), template('<Panel>\n<Header />\n\n<Footer />\n</Panel>'));
});

test('spacing preserves leading and trailing comments, indentation, and CRLF', () => {
    const content = '\n<!-- Action -->\n<EmptyContent><Button /></EmptyContent>';
    assert.equal(fixed(empty(content)), empty('\n' + content));
    const trailing = empty('\n\n<EmptyContent><Button /></EmptyContent>').replace('</EmptyHeader>\n\n', '</EmptyHeader><!-- Keep -->\n');
    assert.match(fixed(trailing), /<\/EmptyHeader><!-- Keep -->\n\n<EmptyContent>/);
    const crlf = empty('\n  <EmptyContent><Button /></EmptyContent>').replaceAll('\n', '\r\n');
    const output = fixed(crlf);
    assert.match(output, /<\/EmptyHeader>\r\n\r\n  <EmptyContent>/);
    assert.equal(output.replaceAll('\r\n', '').includes('\n'), false);
});

test('spacing does not rewrite invalid structure or incorrectly ordered children', () => {
    const sourceCode = empty('\n<Wrong />\n<EmptyContent><Button /></EmptyContent>');
    assert.equal(lint(sourceCode, {fix: true}).output, sourceCode);
});

test('missing comments use the first valid source and preserve literal word boundaries', () => {
    const sourceCode = empty().replace('<!-- No results -->\n', '');
    assert.equal(fixed(sourceCode), empty());
    const inline = empty('', header('No <strong>matching</strong> results')).replace('<!-- No results -->\n', '');
    assert.match(fixed(inline), /<!-- No matching results -->/);
    const repeated = empty('', header('go <span>go</span>')).replace('<!-- No results -->\n', '');
    assert.match(fixed(repeated), /<!-- go go -->/);
});

test('empty or unextractable sources fall through to the next source', () => {
    for (const title of ['', '   ', '{{ title }}', 'Some {{ title }}', '<slot />', '<Unknown>Hidden</Unknown>', '<span v-if="visible">Maybe</span>']) {
        const sourceCode = empty('', header(title)).replace('<!-- No results -->\n', '');
        assert.match(fixed(sourceCode), /<!-- Try another search -->/);
    }
    const dynamicDirective = empty('', header()).replace('<EmptyTitle>', '<EmptyTitle v-text="title">').replace('<!-- No results -->\n', '');
    assert.match(fixed(dynamicDirective), /<!-- Try another search -->/);
});

test('missing source entries fall through without hiding structural violations', () => {
    const sourceCode = empty('', '<EmptyHeader><EmptyDescription>Fallback</EmptyDescription></EmptyHeader>').replace('<!-- No results -->\n', '');
    const result = lint(sourceCode, {fix: true});
    assert.match(result.output, /<!-- Fallback -->/);
    assert.deepEqual(result.messages.map((message) => message.messageId), ['missing']);
});

test('comment sources follow definition order, not incorrect markup order', () => {
    const sourceCode = template('<Empty><EmptyHeader><EmptyDescription>Second</EmptyDescription><EmptyTitle>First</EmptyTitle></EmptyHeader></Empty>');
    const result = lint(sourceCode, {fix: true});
    assert.match(result.output, /<!-- First -->/);
    assert.deepEqual(result.messages.map((message) => message.messageId), ['order']);
});

test('sources are scoped to their exact path and repeated occurrence', () => {
    const rules = createComponentRules([comment(), entry('Panel', [
        entry('Section', [entry('Title')]),
        entry('Section', [source('Title')]),
    ])]);
    const sourceCode = template('<Panel><Section><Title>Wrong</Title></Section><Section><Title>Right</Title></Section></Panel>');
    assert.match(fixed(sourceCode, {rules}), /<!-- Right -->/);
});

test('no usable source requires a manual comment; authored comments satisfy it', () => {
    const sourceCode = empty('', header('{{ title }}', '{{ description }}')).replace('<!-- No results -->\n', '');
    const result = lint(sourceCode, {fix: true});
    assert.equal(result.fixed, false);
    assert.deepEqual(result.messages.map((message) => message.messageId), ['commentManual']);
    assert.deepEqual(lint(sourceCode.replace('<Empty>', '<!-- Search state -->\n<Empty>')).messages, []);
});

test('wrong existing comments are reported without overwriting authored text', () => {
    const sourceCode = empty().replace('<!-- No results -->', '<!-- Custom -->');
    const result = lint(sourceCode, {fix: true});
    assert.equal(result.output, sourceCode);
    assert.deepEqual(result.messages.map((message) => message.messageId), ['commentMismatch']);
    assert.equal(fixed(empty().replace('<!-- No results -->', '<!-- -->')), empty());
});

test('comment fixes escape delimiters and work with inline markup and CRLF', () => {
    const sourceCode = template(`<Empty>${header('A --&gt; B &lt; C &gt; D')}</Empty>`);
    const output = fixed(sourceCode);
    assert.match(output, /<!-- A &#45;&#45;&gt; B &lt; C &gt; D -->/);
    const crlf = template(`<div><Empty>${header()}</Empty></div>`).replaceAll('\n', '\r\n');
    const result = fixed(crlf);
    assert.match(result, /<div>\r\n<!-- No results -->\r\n<Empty>/);
    assert.equal(result.replaceAll('\r\n', '').includes('\n'), false);
});

test('nested comments and blank lines cooperate and settle after fixes', () => {
    const rules = createComponentRules([entry('Panel', [
        entry('Header'), blank(), comment(), entry('Body', [source('Title')]),
    ])]);
    const output = fixed(template('<Panel>\n<Header />\n<Body><Title>Body title</Title></Body>\n</Panel>'), {rules});
    assert.match(output, /<Header \/>\n\n<!-- Body title -->\n<Body>/);
});

test('invalid definitions fail early with a useful path', () => {
    for (const structure of [
        {}, [], [entry('Panel'), entry('Other')],
        [{Panel: {flags: ['required', 'optional']}}],
        [{Panel: {flags: ['unknown']}}],
        [{Panel: {flags: ['required', 'required']}}],
        [{Panel: {flags: ['required'], typo: []}}],
        [{Panel: {flags: ['required'], children: {}}}],
        [{Panel: {}, Other: {}}],
        [entry('Panel', [blank(), entry('Header')])],
        [entry('Panel', [entry('Header'), blank()])],
        [entry('Panel', [comment()])],
        [entry('Panel', [source('Comment'), entry('Header')])],
    ]) {
        assert.throws(() => createComponentRules(structure), /Invalid component structure at structure/);
    }
});

test('explicit empty children forbid contents while omitted children allow them', () => {
    const rules = createComponentRules([entry('Panel', [entry('Closed', []), entry('Open')])]);
    const result = lint(template('<Panel><Closed>Text</Closed><Open><Whatever /></Open></Panel>'), {rules});
    assert.deepEqual(result.messages.map((message) => message.messageId), ['unexpected']);
});

test('generated rules safely ignore files without a Vue template parser', () => {
    const linter = new Linter();
    const config = [{plugins: {escore: {rules: emptyRules}}, rules: Object.fromEntries(Object.keys(emptyRules).map((name) => [`escore/${name}`, 'error']))}];
    assert.deepEqual(linter.verify('const value = 1;', config), []);
});

const layoutRules = (name, layout) => createComponentRules([entry(name, undefined, ['required', layout])]);

test('one-liner fixes the complete EmptyDescription from the supplied example', () => {
    const sourceCode = empty('', header('No results', '\n    Create a project to collect your work in one place.\n'));
    const expected = empty('', header('No results', 'Create a project to collect your work in one place.'));
    const result = lint(sourceCode);
    assert.deepEqual(result.messages.map((message) => message.ruleId), ['escore/empty-must-follow-line-layout']);
    assert.equal(fixed(sourceCode), expected);
});

test('one-liner joins attribute layout without changing values or bindings', () => {
    const rules = layoutRules('Label', 'one-liner');
    const sourceCode = template(`<Label
    class="two  spaces"
    :title="label + '  text'"
>
    Hello {{ name }}!
</Label>`);
    assert.equal(fixed(sourceCode, {rules}), template('<Label class="two  spaces" :title="label + \'  text\'">Hello {{ name }}!</Label>'));
    assert.equal(fixed(template('<Label\n    title="Keep"\n/>'), {rules}), template('<Label title="Keep" />'));
});

test('one-liner preserves explicit edge spaces and inline word boundaries', () => {
    const rules = layoutRules('Label', 'one-liner');
    assert.equal(fixed(template('<Label\n    title="Keep"> word </Label>'), {rules}), template('<Label title="Keep"> word </Label>'));
    const sourceCode = template('<div>before<Label>\n    middle\n</Label>after</div>');
    assert.equal(fixed(sourceCode, {rules}), template('<div>before<Label> middle </Label>after</div>'));
});

test('one-liner reports unsafe joins for an agent instead of changing their meaning', () => {
    const rules = layoutRules('Label', 'one-liner');
    for (const markup of [
        '<Label title="first\nsecond">Text</Label>',
        '<Label :title="`first\nsecond`">Text</Label>',
        '<Label>\n{{ (() => { return\nvalue })() }}\n</Label>',
        '<Label>\n<span>Nested text</span>\n</Label>',
        '<Label>\n<!-- Keep -->Text\n</Label>',
    ]) {
        const sourceCode = template(markup);
        const result = lint(sourceCode, {rules, fix: true});
        assert.equal(result.output, sourceCode);
        assert.deepEqual(result.messages.map((message) => message.messageId), ['oneLine']);
    }
});

test('multi-liner separates opening, content, and closing lines', () => {
    const rules = layoutRules('Button', 'multi-liner');
    assert.equal(fixed(template('<Button>Save</Button>'), {rules}), template('<Button>\n    Save\n</Button>'));
    assert.equal(fixed(template('    <Button>{{ saveLabel }}</Button>'), {rules}), template('    <Button>\n        {{ saveLabel }}\n    </Button>'));
    assert.equal(fixed(template('<Button />'), {rules}), template('<Button>\n</Button>'));
    assert.equal(fixed(template('<Button></Button>'), {rules}), template('<Button>\n</Button>'));
});

test('multi-liner checks content boundaries even when attributes already span lines', () => {
    const rules = layoutRules('Button', 'multi-liner');
    const sourceCode = template('<Button\n    title="Keep">Save</Button>');
    assert.equal(fixed(sourceCode, {rules}), template('<Button\n    title="Keep">\n    Save\n</Button>'));
    assert.equal(fixed(template('<Button>\n    Save</Button>'), {rules}), template('<Button>\n    Save\n</Button>'));
    assert.equal(fixed(template('<Button>Save\n</Button>'), {rules}), template('<Button>\n    Save\n</Button>'));
});

test('multi-liner preserves attribute strings, expressions, and comments', () => {
    const rules = layoutRules('Button', 'multi-liner');
    const sourceCode = template('<Button :title="`first\nsecond`">{{ (() => { return\nvalue })() }}<!-- Keep --></Button>');
    const output = fixed(sourceCode, {rules});
    assert.ok(output.includes(':title="`first\nsecond`"'));
    assert.ok(output.includes('{{ (() => { return\nvalue })() }}<!-- Keep -->'));
    assert.ok(output.endsWith('\n</Button>\n</template>'));
});

test('layout fixes preserve CRLF and tab indentation', () => {
    const rules = layoutRules('Button', 'multi-liner');
    const sourceCode = template('\t<Button>Save</Button>').replaceAll('\n', '\r\n');
    assert.equal(fixed(sourceCode, {rules}), template('\t<Button>\n\t\tSave\n\t</Button>').replaceAll('\n', '\r\n'));
    const oneLine = template('\t<Label>\n\t\tText\n\t</Label>').replaceAll('\n', '\r\n');
    assert.equal(fixed(oneLine, {rules: layoutRules('Label', 'one-liner')}), template('\t<Label>Text</Label>').replaceAll('\n', '\r\n'));
});

test('layout flags leave preformatted and v-pre content for manual repair', () => {
    for (const layout of ['one-liner', 'multi-liner']) {
        const rules = layoutRules('Label', layout);
        const content = layout === 'one-liner' ? '<Label>\n  Text\n</Label>' : '<Label>Text</Label>';
        for (const markup of [`<pre>${content}</pre>`, `<div v-pre>${content}</div>`]) {
            const sourceCode = template(markup);
            const result = lint(sourceCode, {rules, fix: true});
            assert.equal(result.output, sourceCode);
            assert.equal(result.messages.length, 1);
        }
    }
});

test('layout flags belong to each occurrence, including optional components', () => {
    const rules = createComponentRules([entry('Panel', [
        entry('Label', undefined, ['required', 'one-liner']),
        entry('Label', undefined, ['optional', 'multi-liner']),
    ])]);
    const sourceCode = template('<Panel>\n    <Label>\n        First\n    </Label>\n    <Label>Second</Label>\n</Panel>');
    assert.equal(fixed(sourceCode, {rules}), template('<Panel>\n    <Label>First</Label>\n    <Label>\n        Second\n    </Label>\n</Panel>'));
    assert.deepEqual(lint(template('<Panel><Label>Only</Label></Panel>'), {rules}).messages, []);
});

test('parent multi-liner and child one-liner fixes settle together', () => {
    const rules = createComponentRules([entry('Panel', [
        entry('Label', undefined, ['required', 'one-liner']),
    ], ['required', 'multi-liner'])]);
    const sourceCode = template('<Panel><Label>\n    Text\n</Label></Panel>');
    assert.equal(fixed(sourceCode, {rules}), template('<Panel>\n    <Label>Text</Label>\n</Panel>'));
});

test('layout validation rejects opposing flags and flags on special entries', () => {
    assert.throws(() => createComponentRules([entry('Label', undefined, ['required', 'one-liner', 'multi-liner'])]), /cannot be used together/);
    for (const layout of ['one-liner', 'multi-liner']) {
        assert.throws(() => createComponentRules([entry('Comment', undefined, ['required', layout]), entry('Label')]), /cannot.*use layout flags/);
        assert.throws(() => createComponentRules([entry('Panel', [entry('Header'), entry('BlankLine', undefined, ['required', layout]), entry('Footer')])]), /cannot.*use layout flags/);
    }
});

test('the shared configuration enables general rules globally and family rules for Vue', () => {
    const configUrl = new URL('../eslint.config.js', import.meta.url).href;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
        const {default: config} = await import(${JSON.stringify(configUrl)});
        const registered = new Set(config.flatMap((item) => Object.keys(item.plugins?.escore?.rules ?? {})));
        const enabled = new Set(config.flatMap((item) => Object.keys(item.rules ?? {}).filter((name) => name.startsWith('escore/'))));
        const generalScope = ['comment-must-have-blank-line-above', 'all-must-not-have-aria-attributes', 'all-must-not-have-title-attribute']
            .every((name) => config.some((item) => !item.files && item.rules?.['escore/' + name] === 'error'));
        const componentScope = config.some((item) => item.files?.includes('**/*.vue') && item.rules?.['escore/empty-must-have-valid-comments'] === 'error');
        console.log(JSON.stringify({registered: [...registered].sort(), enabled: [...enabled].sort(), generalScope, componentScope}));
    `], {cwd: projectDirectory, encoding: 'utf8'});
    const result = JSON.parse(output);
    const expected = [...Object.keys(emptyRules), 'comment-must-have-blank-line-above', 'all-must-not-have-aria-attributes', 'all-must-not-have-title-attribute'].sort();
    assert.deepEqual(result.registered, expected);
    assert.deepEqual(result.enabled, expected.map((name) => `escore/${name}`));
    assert.equal(result.generalScope, true);
    assert.equal(result.componentScope, true);
});
