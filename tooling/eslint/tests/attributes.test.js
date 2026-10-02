import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import test from 'node:test';
import createComponentRules from '../helpers/create-component-rules.js';
import radioGroupRules from '../rules/components/radio-group.js';

const projectRequire = createRequire(join(process.env.STRATA_TEST_PROJECT ?? process.cwd(), 'package.json'));
const {Linter} = projectRequire('eslint');
const parser = projectRequire('vue-eslint-parser');
const tsParser = projectRequire('@typescript-eslint/parser');

const entry = (name, options = {}) => ({[name]: {flags: ['required'], ...options}});
const control = () => entry('Choice', {attributes: {id: ['non-empty']}});
const label = () => entry('ChoiceLabel', {attributes: {for: ['non-empty', 'matches:Choice.id']}});
const structure = [entry('Options', {children: [entry('Option', {
    flags: ['required', 'repeatable'],
    attributes: {orientation: ['value:horizontal']},
    children: [control(), entry('Content', {children: [label()]})],
})]})];
const optionRules = createComponentRules(structure);
const option = (id, target = id, attrs = 'orientation="horizontal"') => `<Option ${attrs}><Choice ${id} /><Content><ChoiceLabel ${target.replace(/^id=/, 'for=').replace(/^:id(?==|$)/, ':for')}>Label</ChoiceLabel></Content></Option>`;

function lint(markup, {rules = optionRules, only, script = ''} = {}) {
    const config = [{
        files: ['**/*.vue'],
        languageOptions: {parser, parserOptions: {parser: tsParser}, ecmaVersion: 'latest', sourceType: 'module'},
        plugins: {strata: {rules}},
        rules: Object.fromEntries((only ?? Object.keys(rules).filter((name) => name.endsWith('-must-have-valid-attributes')))
            .map((name) => [`strata/${name}`, 'error'])),
    }];
    const input = `${script ? `<script setup lang="ts">${script}</script>\n` : ''}<template>\n${markup}\n</template>`;
    const result = new Linter().verifyAndFix(input, config, {filename: 'attributes.vue'});
    assert.deepEqual(result.messages.filter((message) => message.fatal), [], 'fixture must parse');
    assert.equal(result.fixed, false, 'attribute violations must not invent values or rewrite bindings');
    assert.equal(result.output, input);
    return result.messages;
}

test('attribute definitions reject invalid constraints, aliases, and nonexistent references', () => {
    for (const attributes of [null, [], {id: 'non-empty'}, {id: []}, {id: ['required']},
        {':id': ['non-empty']}, {id: ['non-empty', 'non-empty']}, {id: [null]},
        {id: ['value:']}, {id: ['value:one\ntwo']}, {id: ['value:one', 'value:two']},
        {id: ['matches:Choice']}, {id: ['matches:Choice.id', 'matches:Option.id']},
        {'data-id': ['non-empty'], dataId: ['non-empty']}]) {
        assert.throws(() => createComponentRules([entry('Options', {attributes})]), /Invalid component structure/);
    }
    for (const special of ['Comment', 'BlankLine', 'Group']) {
        assert.throws(() => createComponentRules([entry('Options', {children: [entry(special, {attributes: {id: ['non-empty']}})]})]), /attributes can only/);
    }
    assert.throws(() => createComponentRules([entry('Options', {children: [entry('Choice', {flags: ['forbidden'], attributes: {id: ['non-empty']}})]})]), /attributes can only/);
    assert.throws(() => createComponentRules([entry('Options', {attributes: {id: ['matches:Missing.id']}})]), /no allowed target/);
});

test('fixed attribute values accept static and bound literals and reject unverified values', () => {
    for (const attrs of ['orientation="horizontal"', ':orientation="\'horizontal\'"', ':orientation="`horizontal`"',
        ':orientation="(\'horizontal\' as const)"', ':[\'orientation\']="\'horizontal\'"', 'v-bind="{orientation: \'horizontal\'}"']) {
        assert.deepEqual(lint(`<Options>${option('id="one"', undefined, attrs)}</Options>`), [], attrs);
    }
    for (const attrs of ['orientation="vertical"', ':orientation="mode"', ':orientation="null"', 'v-bind="attrs"',
        ':orientation="true"', 'orientation="horizontal" v-bind="attrs"']) {
        const messages = lint(`<Options>${option('id="one"', undefined, attrs)}</Options>`);
        assert.deepEqual(messages.map((message) => message.messageId), ['attributeValue'], attrs);
        assert.match(messages[0].message, /Set orientation on <Option> to "horizontal"/);
    }
    assert.deepEqual(lint(`<Options>${option('id="one"', undefined, '')}</Options>`), [], 'types own required presence');
});

test('nonempty attributes reject known empty values while preserving dynamic bindings', () => {
    for (const attribute of ['id', 'id=""', 'id="   "', ':id="\'\'"', ':id="null"', ':id="undefined"', ':id="void 0"']) {
        const messages = lint(`<Options>${option(attribute, 'for="one"')}</Options>`);
        assert.ok(messages.some((message) => message.messageId === 'attributeEmpty'), attribute);
    }
    for (const attribute of [':id="value"', ':id="item.id"', ':id="undefined"']) {
        assert.deepEqual(lint(`<Options>${option(attribute)}</Options>`, {script: 'const undefined = "known";'}), [], attribute);
    }
});

test('attribute matching accepts literal equivalence and normalized bindings in the same scope', () => {
    for (const [id, target] of [
        ['id="one"', ':for="\'one\'"'], [':id="`one`"', 'for="one"'],
        [':id="row.id"', ':for="(row.id as string)!"'],
        [':id="`option-${row.id}`"', ':for="`option-${row.id}`"'],
        [':id="row[\'id\']"', ':for="row[`id`]"'],
        [':id', ':for="id"'],
        ['v-bind="{id: row.id, other: extra}"', ':for="row.id"'],
        [':id="row.id"', 'v-bind="{for: row.id, other: extra}"'],
    ]) {
        assert.deepEqual(lint(`<Options>${option(id, target)}</Options>`), [], `${id} / ${target}`);
    }
    assert.deepEqual(lint(`<Options>${option(':id="row.id"', undefined, 'v-for="row in rows" orientation="horizontal"')}</Options>`), []);
});

test('attribute matching rejects different values, missing targets, and separate repeated fields', () => {
    const swapped = `<Options>${option('id="one"', 'for="two"')}${option('id="two"', 'for="one"')}</Options>`;
    assert.deepEqual(lint(swapped).map((message) => message.messageId), ['attributeMismatch', 'attributeMismatch']);
    for (const [id, target] of [[':id="row.id"', ':for="other.id"'], [':id="makeId()"', ':for="makeId()"'],
        ['id="one"', ':for="id"'], ['v-bind="attrs"', 'for="one"'], ['id="one"', 'v-bind="attrs"']]) {
        assert.deepEqual(lint(`<Options>${option(id, target)}</Options>`).map((message) => message.messageId), ['attributeMismatch']);
    }
    const missing = `<Options>${option('id="one"')}<Option><Content><ChoiceLabel for="one" /></Content></Option></Options>`;
    assert.deepEqual(lint(missing).map((message) => message.messageId), ['attributeMismatch']);
    assert.match(lint(missing)[0].message, /in the same <Option>/);
});

test('attribute matching distinguishes shadowed loop and slot variables, including object bindings', () => {
    for (const labelBinding of [':for="row.id"', 'v-bind="{for: row.id}"']) {
        for (const scope of ['v-for="row in others"', 'v-slot="{row}"']) {
            const markup = `<Options><Option v-for="row in rows"><Choice :id="row.id" /><Content ${scope}><ChoiceLabel ${labelBinding} /></Content></Option></Options>`;
            assert.deepEqual(lint(markup).map((message) => message.messageId), ['attributeMismatch']);
        }
    }
    const outsideLoop = '<Options><Option><Choice :id="row.id" /><Content v-for="row in rows"><ChoiceLabel :for="row.id" /></Content></Option></Options>';
    assert.equal(lint(outsideLoop)[0].messageId, 'attributeMismatch');
});

test('attribute constraints honor binding overrides, spreads, computed keys, and v-pre', () => {
    for (const [attrs, valid] of [
        ['orientation="vertical" v-bind="{orientation: \'horizontal\'}"', true],
        ['v-bind="{...attrs, orientation: \'horizontal\'}"', true],
        ['v-bind="attrs" orientation="horizontal"', true],
        ['orientation="horizontal" v-bind="{orientation: \'vertical\'}"', false],
        ['v-bind="{orientation: \'horizontal\', ...attrs}"', false],
        ['orientation="horizontal" :[key]="value"', false],
    ]) assert.equal(lint(`<Options>${option('id="one"', undefined, attrs)}</Options>`).length, valid ? 0 : 1, attrs);
    assert.deepEqual(lint('<Options v-pre><Option orientation="wrong"><Choice id="" /><Content><ChoiceLabel for="" /></Content></Option></Options>'), []);
    assert.deepEqual(lint(`<Options>${option('id="wrong" v-bind="{id: \'one\'}"', 'for="one"')}</Options>`), []);
    assert.equal(lint(`<Options>${option('id="one" v-bind="{id: \'wrong\'}"', 'for="one"')}</Options>`)[0].messageId, 'attributeMismatch');
});

test('transparent repeated groups keep attribute associations inside each occurrence', () => {
    const rules = createComponentRules([entry('Options', {children: [entry('Group', {
        flags: ['required', 'repeatable'], children: [control(), entry('Content', {children: [label()]})],
    })]})]);
    const pair = (id, target = id) => `<Choice id="${id}" /><Content><ChoiceLabel for="${target}" /></Content>`;
    assert.deepEqual(lint(`<Options>${pair('one')}${pair('two')}</Options>`, {rules}), []);
    assert.deepEqual(lint(`<Options>${pair('one', 'two')}${pair('two', 'one')}</Options>`, {rules}).map((message) => message.messageId), ['attributeMismatch', 'attributeMismatch']);
    assert.deepEqual(lint(`<Options>${pair('one')}<Content><ChoiceLabel for="one" /></Content></Options>`, {rules}).map((message) => message.messageId), ['attributeMismatch']);
});

test('matching ambiguous repeated targets requires one target in the declared scope', () => {
    const rules = createComponentRules([entry('Options', {children: [
        entry('Choice', {flags: ['required', 'repeatable']}), label(),
    ]})]);
    assert.deepEqual(lint('<Options><Choice id="one" /><Choice id="two" /><ChoiceLabel for="one" /></Options>', {rules}).map((message) => message.messageId), ['attributeMismatch']);
});

test('shared nested attribute constraints remain active with family-only prop scope', () => {
    const rules = createComponentRules(structure, {propsScope: 'family'});
    assert.deepEqual(lint(`<Options>${option('id="one"', 'for="two"', 'orientation="vertical"')}</Options>`, {rules})
        .map((message) => message.messageId), ['attributeValue', 'attributeMismatch']);
});

test('RadioGroup enforces horizontal Fields and matching nonempty IDs and label targets', () => {
    const field = (id, target = id, orientation = 'horizontal') => `<Field orientation="${orientation}"><RadioGroupItem id="${id}" value="${id}" /><FieldContent><FieldLabel for="${target}">Plan</FieldLabel></FieldContent></Field>`;
    assert.deepEqual(lint(`<RadioGroup>${field('free')}${field('pro')}</RadioGroup>`, {rules: radioGroupRules}), []);
    const invalid = lint(`<RadioGroup>${field('free', 'pro', 'vertical')}${field('pro', 'free')}${field('')}</RadioGroup>`, {rules: radioGroupRules});
    assert.deepEqual(invalid.map((message) => message.messageId), ['attributeValue', 'attributeMismatch', 'attributeMismatch', 'attributeEmpty', 'attributeEmpty']);
    assert.match(invalid[1].message, /same value or binding as id on a single <RadioGroupItem> in the same <Field>/);
});

test('the complete RadioGroup structure passes comments, layout, props, and attribute checks together', () => {
    const markup = `<!-- Plans -->
<RadioGroup>
    <!-- Free -->
    <Field orientation="horizontal">
        <RadioGroupItem id="plan-free" value="free" />
        <FieldContent>
            <FieldLabel for="plan-free">Free</FieldLabel>
        </FieldContent>
    </Field>
    <!-- Pro -->
    <Field orientation="horizontal">
        <RadioGroupItem id="plan-pro" value="pro" />
        <FieldContent>
            <FieldLabel for="plan-pro">Pro</FieldLabel>
        </FieldContent>
    </Field>
</RadioGroup>`;
    assert.deepEqual(lint(markup, {rules: radioGroupRules, only: Object.keys(radioGroupRules)}), []);
});

test('RadioGroup prop validation reads required IDs and label targets from the updated source types', () => {
    const only = ['radiogroup-must-have-valid-props'];
    const markup = '<RadioGroup><Field><RadioGroupItem value="one" /><FieldContent><FieldLabel>One</FieldLabel></FieldContent></Field></RadioGroup>';
    const messages = lint(markup, {rules: radioGroupRules, only});
    assert.deepEqual(messages.map((message) => message.messageId), ['propMissing', 'propMissing', 'propMissing']);
    for (const [index, name] of ['orientation', 'id', 'for'].entries()) assert.match(messages[index].message, new RegExp(`required ${name} prop`));
    for (const value of ['null', 'undefined', '123']) {
        const invalid = `<RadioGroup><Field orientation="horizontal"><RadioGroupItem :id="${value}" value="one" /><FieldContent><FieldLabel :for="${value}">One</FieldLabel></FieldContent></Field></RadioGroup>`;
        assert.deepEqual(lint(invalid, {rules: radioGroupRules, only}).map((message) => message.messageId), ['propValue', 'propValue']);
    }
});
