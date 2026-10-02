import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import openingRule from '../rules/packages/inertia-plus/enforce-one-liner-inertia-plus-opening.js';
import enforceAttributeOrderInput from '../rules/template/element-attributes-order/enforce-attribute-order-input.js';
import forbidHardcodedUrls from '../rules/general/forbid-hardcoded-urls.js';
import forbidOneLinerButton from '../rules/template/element-one-liners/forbid-one-liner-button.js';
import forbidOneLinerTableHead from '../rules/template/element-one-liners/forbid-one-liner-table-head.js';
import forbidOneLinerTableCell from '../rules/template/element-one-liners/forbid-one-liner-table-cell.js';
import requireCommentTableHead from '../rules/template/element-comments/require-comment-table-head.js';
import requireCommentDialog from '../rules/template/element-comments/require-comment-dialog.js';

// Resolve the consuming project's dependencies, just like the shared config.
const projectRequire = createRequire(join(process.cwd(), 'package.json'));
const { Linter } = projectRequire('eslint');
const vueParser = projectRequire('vue-eslint-parser');
const tsParser = projectRequire('@typescript-eslint/parser');
const { compile } = projectRequire('@vue/compiler-dom');
const Vue = projectRequire('vue');

const lint = (rule, source, { fix = false, filename = 'regression.vue' } = {}) => {
  const isVue = filename.endsWith('.vue');
  const config = [{
    files: [isVue ? '**/*.vue' : '**/*.ts'],
    languageOptions: {
      parser: isVue ? vueParser : tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module' },
    },
    plugins: { regression: { rules: { check: rule } } },
    rules: { 'regression/check': 'error' },
  }];
  const linter = new Linter();
  const result = fix
    ? linter.verifyAndFix(source, config, { filename })
    : { messages: linter.verify(source, config, { filename }), output: source, fixed: false };
  assert.deepEqual(result.messages.filter((message) => message.fatal), [], 'source must remain valid');
  return result;
};
const template = (content) => `<template>\n${content}\n</template>`;
const templateContent = (source) => source.match(/<template>([\s\S]*)<\/template>/)[1].trim();
const fixScript = (rule, source) => lint(rule, source, { fix: true, filename: 'regression.ts' });
const verifyScript = (source) => lint(forbidHardcodedUrls, source, { filename: 'regression.ts' }).messages;
const formImport = "import { useInertiaPlusForm } from 'strata-packages/inertia-plus';";

test('single-line openings preserve ASI-sensitive option bodies and class/type members', () => {
  const sources = [
    'const editForm=useInertiaPlusForm({openable:false,minimumLoading:true,minimumLoadingDuration:(()=>{const duration=300\nreturn duration})()},\n{});',
    'const editForm=useInertiaPlusForm({openable:false,minimumLoading:true,minimumLoadingDuration:(()=>{return\n300})()},\n{});',
    'const editForm=useInertiaPlusForm({openable:false,minimumLoading:true,minimumLoadingDuration:class { first=1\nsecond=2 }},\n{});',
    'const editForm: { first: string\nsecond: string } = useInertiaPlusForm({openable:false,minimumLoading:true},\n{});',
  ];

  for (const source of sources) {
    const result = fixScript(openingRule, source);
    assert.equal(result.output, source);
    assert.equal(result.fixed, false);
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].messageId, 'opening');
  }

  const result = fixScript(openingRule, sources[1]);
  const options = new Function('useInertiaPlusForm', `${result.output}\nreturn editForm;`)((value) => value);
  assert.equal(options.minimumLoadingDuration, undefined, 'return-newline semantics must survive');
});

test('ordinary options flatten while the multiline form definition stays intact', () => {
  const source = `const editForm = useInertiaPlusForm(
  { openable: false, minimumLoading: true },
  {
    submit() {
      return
      300
    },
  },
);`;
  const result = fixScript(openingRule, source);
  assert.equal(result.fixed, true);
  assert.deepEqual(result.messages, []);
  assert.match(result.output, /^const editForm = useInertiaPlusForm\( \{ openable: false, minimumLoading: true \}, \{\n/);
  assert.ok(result.output.endsWith(source.slice(source.indexOf('\n    submit()'))));
});

test('single-line openings leave comments and multiline tokens untouched', () => {
  for (const options of [
    '{ openable: false, // keep this comment\nminimumLoading: true }',
    '{ openable: false, /* keep this comment */ minimumLoading: true }',
    '{ openable: false, minimumLoading: true, value: `first\nsecond` }',
  ]) {
    const source = `const editForm = useInertiaPlusForm(${options},\n{});`;
    const result = fixScript(openingRule, source);
    assert.equal(result.output, source);
    assert.equal(result.fixed, false);
    assert.equal(result.messages.length, 1);
  }
});

const runUpdateHandlers = (markup) => {
  const previous = [];
  const state = { value: 'old', recordPrevious: (value) => previous.push(value) };
  const { code } = compile(markup, { mode: 'function', prefixIdentifiers: true });
  const render = new Function('Vue', code)({ ...Vue, resolveComponent: (name) => name });
  const vnode = render(state, []);
  for (const handler of [vnode.props['onUpdate:modelValue']].flat()) handler('new');
  return { value: state.value, previous };
};

test('attribute fixes preserve compiled v-model listener execution order', () => {
  for (const event of ['@update:model-value', '@update:modelValue']) {
    const markup = `<Input ${event}="recordPrevious(value)" v-model="value" />`;
    const result = lint(enforceAttributeOrderInput, template(markup), { fix: true });
    assert.equal(result.fixed, false);
    assert.equal(result.messages.length, 1);
    assert.deepEqual(runUpdateHandlers(templateContent(result.output)), runUpdateHandlers(markup));
    assert.deepEqual(runUpdateHandlers(templateContent(result.output)), { value: 'new', previous: ['old'] });
  }
});

test('attribute fixes preserve overlapping model props, named models, and modifier props', () => {
  for (const markup of [
    '<Input :model-value="initial" v-model="value" />',
    '<Input :modelValue="initial" v-model="value" />',
    '<Input model-value="initial" v-model="value" />',
    '<Input class="field" @update:first-name="recordPrevious(value)" v-model:firstName="value" />',
    '<Input class="field" :firstName="initial" v-model:first-name="value" />',
    '<Input class="field" :model-modifiers="modifiers" v-model.trim="value" />',
    '<Input class="field" :first-name-modifiers="modifiers" v-model:firstName.trim="value" />',
    '<Input class="field" :onUpdate:modelValue="handler" v-model="value" />',
  ]) {
    const source = template(markup);
    const result = lint(enforceAttributeOrderInput, source, { fix: true });
    assert.equal(result.output, source, markup);
    assert.equal(result.fixed, false, markup);
    assert.equal(result.messages.length, 1, markup);
  }
});

test('attribute sorting still protects unknown bindings and sorts noninterfering attributes', () => {
  for (const binding of ['v-bind="attrs"', 'v-on="handlers"', ':[prop]="value"', 'v-model:[prop]="value"']) {
    const source = template(`<Input class="field" ${binding} id="name" />`);
    assert.equal(lint(enforceAttributeOrderInput, source, { fix: true }).output, source);
  }

  const result = lint(enforceAttributeOrderInput, template('<Input class="field" @change="changed" placeholder="Name" id="name" v-model="value" />'), { fix: true });
  assert.equal(result.output, template('<Input id="name" v-model="value" placeholder="Name" class="field" @change="changed" />'));
  assert.deepEqual(result.messages, []);

  const shared = lint(enforceAttributeOrderInput, template('<Input class="field" v-model="value" :model-value="initial" id="name" />'), { fix: true });
  assert.equal(shared.output, template('<Input id="name" v-model="value" :model-value="initial" class="field" />'));
  assert.deepEqual(shared.messages, []);
});

test('custom Inertia Plus submit arguments are not treated as native URLs', () => {
  const source = `${formImport}
const editForm = useInertiaPlusForm({}, {
  submit(kind, name) {},
  beforeSubmit() { this.submit('person', 'Alice'); },
});
const alias = editForm;
editForm.submit('person', 'Alice');
alias.submit('person', 'Alice');`;
  assert.deepEqual(verifyScript(source), []);

  const aliasedFactory = `import { useInertiaPlusForm as makeForm } from 'strata-packages/inertia-plus';
const editForm = makeForm({}, { submit(kind, name) {} });
const alias = editForm;
alias.submit('person', 'Alice');`;
  assert.deepEqual(verifyScript(aliasedFactory), []);

  const component = `<script setup>${source}</script>\n${template('<Button @click="alias.submit(\'person\', \'Alice\')" />')}`;
  assert.deepEqual(lint(forbidHardcodedUrls, component).messages, []);
});

test('native submit URLs remain detectable for useForm and unoverridden Inertia Plus forms', () => {
  const source = `import { useForm } from '@inertiajs/vue3';
${formImport}
const native = useForm({});
native.submit('post', '/native');
native.submit({ method: 'post', url: '/native-options' });
const editForm = useInertiaPlusForm({}, {
  name: '',
  beforeSubmit() { this.submit('post', '/inside-form'); },
});
const alias = editForm;
alias.submit('post', '/plain-form');`;
  const messages = verifyScript(source);
  assert.equal(messages.length, 4);
  assert.ok(messages.every((message) => message.messageId === 'request'));

  const component = `<script setup>${formImport}
const editForm = useInertiaPlusForm({}, {});
</script>\n${template('<Button @click="editForm.submit(\'post\', \'/template\')" />')}`;
  assert.equal(lint(forbidHardcodedUrls, component).messages.length, 1);
});

test('unknown form definitions do not guess the submit signature', () => {
  for (const definition of ['definition', '{ ...methods }', '{ [methodName]() {} }', "{ ['submit'](kind, name) {} }"]) {
    const source = `${formImport}
const editForm = useInertiaPlusForm({}, ${definition});
const alias = editForm;
alias.submit('person', 'Alice');`;
    assert.deepEqual(verifyScript(source), [], definition);
  }
});

test('custom and unknown forms still report real HTTP methods including method this and templates', () => {
  const source = `${formImport}
const editForm = useInertiaPlusForm({}, {
  submit(kind, name) {
    this.post('/inside-submit');
    (() => this.put('/inside-arrow'))();
  },
});
const alias = editForm;
alias.delete('/alias');
const unknownForm = useInertiaPlusForm({}, definition);
unknownForm.get('/unknown-definition');`;
  assert.equal(verifyScript(source).length, 4);

  const component = `<script setup>${formImport}
const editForm = useInertiaPlusForm({}, { submit(kind, name) {} });
const alias = editForm;
</script>\n${template('<Button @click="alias.post(\'/template\')" />')}`;
  assert.equal(lint(forbidHardcodedUrls, component).messages.length, 1);
});

test('form alias resolution keeps scope and local receivers distinct', () => {
  const source = `import { useForm } from '@inertiajs/vue3';
const editForm = useForm({});
function run(editForm) { editForm.submit('person', 'Alice'); }
const service = { submit(kind, name) {} };
service.submit('person', 'Alice');`;
  assert.deepEqual(verifyScript(source), []);

  const component = `<script setup>${source}</script>\n${template('<Button v-for="editForm in forms" @click="editForm.submit(\'person\', \'Alice\')" />')}`;
  assert.deepEqual(lint(forbidHardcodedUrls, component).messages, []);
});

test('multiline element fixes preserve pre and v-pre whitespace', () => {
  for (const [rule, tag] of [
    [forbidOneLinerButton, 'button'],
    [forbidOneLinerTableHead, 'TableHead'],
    [forbidOneLinerTableCell, 'TableCell'],
  ]) {
    for (const markup of [
      `<pre><${tag}>A</${tag}></pre>`,
      `<div v-pre><${tag}>A</${tag}></div>`,
      `<${tag} v-pre>A</${tag}>`,
    ]) {
      const source = template(markup);
      const result = lint(rule, source, { fix: true });
      assert.equal(result.output, source);
      assert.equal(result.fixed, false);
    }
  }
});

test('ordinary buttons and table cells still receive multiline formatting', () => {
  for (const [rule, tag] of [
    [forbidOneLinerButton, 'button'],
    [forbidOneLinerTableHead, 'TableHead'],
    [forbidOneLinerTableCell, 'TableCell'],
  ]) {
    const result = lint(rule, template(`<${tag}>A</${tag}>`), { fix: true });
    assert.equal(result.output, template(`<${tag}>\n  A\n</${tag}>`));
    assert.deepEqual(result.messages, []);
  }
});

test('replacement comments use the whole static label', () => {
  const result = lint(requireCommentTableHead, template('<!-- Save -->\n<TableHead>Save <strong>changes</strong></TableHead>'), { fix: true });
  assert.equal(result.output, template('<!-- Save changes -->\n<TableHead>Save <strong>changes</strong></TableHead>'));
  assert.deepEqual(result.messages, []);
});

test('dialog title casing respects Unicode words, combining marks, separators, and suffixes', () => {
  for (const [title, comment] of [
    ['añadir categoría', 'Añadir Categoría Dialog'],
    ['an\u0303adir categori\u0301a', 'An\u0303adir Categori\u0301a Dialog'],
    ['écrire déjà-vu', 'Écrire Déjà-Vu Dialog'],
    ['añadir_categoría', 'Añadir_categoría Dialog'],
    ['añadir categoría Dialog', 'Añadir Categoría Dialog'],
  ]) {
    const markup = `<Dialog><DialogTitle>${title}</DialogTitle></Dialog>`;
    const expected = template(`<!-- ${comment} -->\n${markup}`);
    assert.deepEqual(lint(requireCommentDialog, expected).messages, []);
    const result = lint(requireCommentDialog, template(markup), { fix: true });
    assert.equal(result.output, expected);
    assert.deepEqual(result.messages, []);
  }
});

test('native-only title inference preserves boundaries and does not join uncertain child text', () => {
  const markup = '<Dialog><DialogTitle v-if="visible">Log<span>in</span></DialogTitle></Dialog>';
  const result = lint(requireCommentDialog, template(markup), { fix: true });
  assert.equal(result.output, template(`<!-- Login Dialog -->\n${markup}`));
  assert.deepEqual(result.messages, []);

  for (const title of ['Save <span v-if="details">changes</span>', '<span v-text="title" />', 'Save {{ title }}']) {
    const source = template(`<Dialog><DialogTitle>${title}</DialogTitle></Dialog>`);
    assert.equal(lint(requireCommentDialog, source, { fix: true }).output, source);
  }
});
