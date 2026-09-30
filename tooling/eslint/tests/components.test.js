import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import test from 'node:test';
import createComponentRules from '../helpers/create-component-rules.js';
import accordionRules from '../rules/components/accordion.js';
import alertRules from '../rules/components/alert.js';
import alertDialogRules from '../rules/components/alert-dialog.js';
import aspectRatioRules from '../rules/components/aspect-ratio.js';
import attachmentRules from '../rules/components/attachment.js';
import avatarRules from '../rules/components/avatar.js';
import badgeRules from '../rules/components/badge.js';
import breadcrumbRules from '../rules/components/breadcrumb.js';
import bubbleRules from '../rules/components/bubble.js';
import buttonRules from '../rules/components/button.js';
import buttonGroupRules from '../rules/components/button-group.js';
import calendarRules from '../rules/components/calendar.js';
import captionRules from '../rules/components/caption.js';
import cardRules from '../rules/components/card.js';
import checkboxRules from '../rules/components/checkbox.js';
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
    assert.equal(result.messages[0].ruleId, 'escore/empty-must-follow-structure');
    assert.equal(result.messages[0].message, 'Add <Button> directly inside <EmptyContent>. Preserve existing content and bindings.');
    assert.equal(lint(empty('\n\n<EmptyContent />'), {fix: true}).fixed, false);
});

test('wrappers cannot satisfy direct children and unexpected text is rejected', () => {
    const result = lint(empty('', `<div>${header()}</div>`), {only: ['empty-must-follow-structure']});
    assert.deepEqual(result.messages.map((message) => message.messageId).sort(), ['misplaced', 'missing', 'unexpected']);
    for (const content of ['loose text', '{{ value }}', '<Wrong />']) {
        const messages = lint(empty(`\n${content}`), {only: ['empty-must-follow-structure']}).messages;
        assert.equal(messages.length, 1);
        assert.equal(messages[0].messageId, 'unexpected');
    }
});

test('wrong order does not report missing children or automatically move content', () => {
    const reversed = header().replace(/(<EmptyTitle>.*<\/EmptyTitle>)\n    (<EmptyDescription>.*<\/EmptyDescription>)/, '$2\n    $1');
    const result = lint(empty('', reversed), {fix: true});
    assert.deepEqual(result.messages.map((message) => message.messageId), ['order']);
    assert.equal(result.fixed, false);
});

test('orphaned Alert, Empty, and Accordion children report placement without requiring a root', () => {
    const cases = [
        {
            family: 'alert', rules: alertRules,
            markup: '<section class="grid gap-4">\n<!-- Incorrect structure -->\n<AlertTitle>Title outside its parent</AlertTitle>\n<AlertDescription>Description outside its parent.</AlertDescription>\n</section>',
            misplaced: [['AlertTitle', 'Alert'], ['AlertDescription', 'Alert']],
        },
        {
            family: 'empty', rules: emptyRules,
            markup: `<section class="space-y-4">
    <h2>01 · Complete</h2>
    <EmptyMedia variant="icon"><span>□</span></EmptyMedia>
    <EmptyHeader>
        <EmptyTitle>No projects yet</EmptyTitle>
        <EmptyDescription>
            Create a project to keep your work organized in one place.
        </EmptyDescription>
    </EmptyHeader>
    <EmptyContent><button>Create project</button></EmptyContent>
</section>`,
            misplaced: [['EmptyMedia', 'EmptyHeader'], ['EmptyHeader', 'Empty'], ['EmptyContent', 'Empty']],
        },
        {
            family: 'accordion', rules: accordionRules,
            markup: '<section><AccordionItem value="first"><AccordionTrigger>Question</AccordionTrigger><AccordionContent>Answer</AccordionContent></AccordionItem></section>',
            misplaced: [['AccordionItem', 'Accordion']],
        },
    ];
    for (const {family, rules, markup, misplaced} of cases) {
        const sourceCode = template(markup);
        const result = lint(sourceCode, {rules, fix: true});
        assert.equal(result.output, sourceCode, 'placement must never invent or move wrappers');
        assert.equal(result.fixed, false);
        assert.deepEqual(result.messages.map(({ruleId, messageId, message}) => ({ruleId, messageId, message})), misplaced.map(([child, parent]) => ({
            ruleId: `escore/${family}-must-follow-structure`,
            messageId: 'misplaced',
            message: `Move <${child}> directly inside <${parent}>; currently inside <section>. Preserve its content and bindings.`,
        })));
    }
});

test('placement checks kebab names, template wrappers, and family children inside unrestricted leaves', () => {
    for (const markup of [
        '<empty-title>No results</empty-title>',
        '<template v-if="visible"><empty-title>No results</empty-title></template>',
    ]) {
        const result = lint(template(markup), {only: ['empty-must-follow-structure']});
        assert.deepEqual(result.messages.map((message) => message.messageId), ['misplaced']);
        assert.match(result.messages[0].message, /Move <empty-title> directly inside <EmptyHeader>/);
    }
    const result = lint(empty('', header('<EmptyMedia />')), {only: ['empty-must-follow-structure']});
    assert.deepEqual(result.messages.map((message) => message.messageId), ['misplaced']);
    assert.match(result.messages[0].message, /Move <EmptyMedia> directly inside <EmptyHeader>; currently inside <EmptyTitle>/);
});

test('misplaced children have one placement error while extra occurrences still report unexpected children', () => {
    const misplaced = lint(empty('\n<EmptyMedia />'));
    assert.deepEqual(misplaced.messages.map((message) => message.messageId), ['misplaced']);
    const duplicated = lint(empty('', header().replace('</EmptyHeader>', '<EmptyTitle>Duplicate</EmptyTitle></EmptyHeader>')));
    assert.deepEqual(duplicated.messages.map((message) => message.messageId), ['unexpected']);
});

test('placement allows every declared parent for repeated names and repeatable entries', () => {
    const rules = createComponentRules([entry('Panel', [
        entry('PanelHeader', [entry('PanelLabel', undefined, ['required', 'repeatable'])]),
        entry('PanelFooter', [entry('PanelLabel', undefined, ['optional'])]),
    ])]);
    const valid = template('<Panel><PanelHeader><PanelLabel /><PanelLabel /></PanelHeader><PanelFooter><PanelLabel /></PanelFooter></Panel>');
    assert.deepEqual(lint(valid, {rules}).messages, []);
    const result = lint(template('<section><PanelLabel /></section>'), {rules});
    assert.deepEqual(result.messages.map((message) => message.messageId), ['misplaced']);
    assert.match(result.messages[0].message, /directly inside <PanelHeader> or <PanelFooter>/);
});

test('placement keeps shared components and family roots usable elsewhere', () => {
    assert.deepEqual(lint(template('<Button /><section><Button /></section>')).messages, []);
    const rules = createComponentRules([entry('Panel', [entry('Panel', undefined, ['optional'])])]);
    assert.deepEqual(lint(template('<Panel /><section><Panel><Panel /></Panel></section>'), {rules}).messages, []);
});

test('top-level means the file template, including for conditional and slot wrappers', () => {
    const rules = createComponentRules([entry('Panel', undefined, ['required', 'top-level'])]);
    assert.deepEqual(lint(template('<Panel /><PageContent />'), {rules}).messages, []);
    for (const content of [
        '<main><Panel /></main>',
        '<template v-if="visible"><Panel /></template>',
        '<Layout><template #default><Panel /></template></Layout>',
        '<Teleport to="body"><Panel /></Teleport>',
    ]) {
        const markup = template(content);
        const result = lint(markup, {rules, fix: true});
        assert.equal(result.output, markup, 'placement fixes must preserve surrounding conditions and scope');
        assert.equal(result.fixed, false);
        assert.deepEqual(result.messages.map((message) => message.messageId), ['topLevel']);
        assert.match(result.messages[0].message, /Move <Panel> directly inside the root <template>/);
    }
});

test('last-in-template allows an unordered final group, mixed spelling, comments, and whitespace', () => {
    const rules = createComponentRules([entry('SurfaceDialog', undefined, ['required', 'top-level', 'last-in-template'])]);
    for (const content of [
        '<PageContent />',
        '<PageContent /><SurfaceDialog />',
        '<PageContent /><Dialog /><SurfaceDialog id="b" /><surface-dialog id="a" />',
        '<PageContent /><Dialog /><surface-dialog id="a" /><SurfaceDialog id="b" />',
        '<SurfaceDialog v-if="first" /><!-- Alternative -->\n<surface-dialog v-else />\n<!-- Trailing comment -->\n',
        '<SurfaceDialog v-for="item in items" :key="item.id" />',
    ]) {
        assert.deepEqual(lint(template(content), {rules}).messages, [], content);
    }
});

test('last-in-template rejects later elements, text, and interpolations without moving anything', () => {
    const rules = createComponentRules([entry('SurfaceDialog', undefined, ['required', 'top-level', 'last-in-template'])]);
    for (const other of ['<PageContent />', '<Dialog />', 'Visible text', '{{ status }}']) {
        for (const count of [1, 2]) {
            const markup = template(`${'<SurfaceDialog />'.repeat(count)}${other}<SurfaceDialog />`);
            const result = lint(markup, {rules, fix: true});
            assert.equal(result.output, markup);
            assert.equal(result.fixed, false);
            assert.deepEqual(result.messages.map((message) => message.messageId), Array(count).fill('lastInTemplate'));
            assert.match(result.messages[0].message, /Order among <SurfaceDialog> instances is unrestricted/);
        }
    }
    const nested = lint(template('<main><SurfaceDialog /></main><PageContent />'), {rules});
    assert.deepEqual(nested.messages.map((message) => message.messageId), ['topLevel'], 'fix placement before reporting template order');
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

test('repeatable children allow one or more when required and zero or more when optional', () => {
    for (const presence of ['required', 'optional']) {
        const rules = createComponentRules([entry('Panel', [
            entry('Item', [entry('Label')], [presence, 'repeatable']),
        ])]);
        for (const count of [0, 1, 4]) {
            const markup = template(`<Panel>${'<Item><Label /></Item>'.repeat(count)}</Panel>`);
            const result = lint(markup, {rules});
            assert.deepEqual(result.messages.map((message) => message.messageId), count === 0 && presence === 'required' ? ['missing'] : []);
        }
        const result = lint(template('<Panel><Item><Label /></Item><Item /><Item><Wrong /></Item></Panel>'), {rules});
        assert.deepEqual(result.messages.map((message) => message.messageId).sort(), ['missing', 'missing', 'unexpected']);
    }
});

test('repeatable groups keep their declared position and do not accept wrappers', () => {
    const rules = createComponentRules([entry('Panel', [
        entry('Header'), entry('Item', undefined, ['required', 'repeatable']), entry('Footer'),
    ])]);
    assert.deepEqual(lint(template('<Panel><Header /><Item /><Item /><Footer /></Panel>'), {rules}).messages, []);
    for (const content of ['<Header /><Item /><Footer /><Item />', '<Item /><Header /><Item /><Footer />']) {
        const result = lint(template(`<Panel>${content}</Panel>`), {rules, fix: true});
        assert.deepEqual(result.messages.map((message) => message.messageId), ['order']);
        assert.equal(result.fixed, false);
    }
    const wrapped = lint(template('<Panel><Header /><div><Item /></div><Footer /></Panel>'), {rules});
    assert.deepEqual(wrapped.messages.map((message) => message.messageId).sort(), ['missing', 'unexpected']);
});

test('repeatable entries reserve occurrences for later required entries of the same name', () => {
    for (const presence of ['required', 'optional']) {
        const rules = createComponentRules([entry('Panel', [
            entry('Item', [entry('Label')], [presence, 'repeatable']),
            entry('Item', [entry('Button')]),
        ])]);
        const result = lint(template('<Panel><Item><Button /></Item></Panel>'), {rules});
        if (presence === 'optional') assert.deepEqual(result.messages, []);
        else assert.ok(result.messages.some((message) => message.messageId === 'missing'));
        for (const count of [1, 3]) {
            const markup = template(`<Panel>${'<Item><Label /></Item>'.repeat(count)}<Item><Button /></Item></Panel>`);
            assert.deepEqual(lint(markup, {rules}).messages, []);
        }
    }
    const rules = createComponentRules([entry('Panel', [
        entry('Item', [entry('Label')], ['required', 'repeatable']),
        entry('Item', [entry('Button')], ['required', 'repeatable']),
    ])]);
    assert.deepEqual(lint(template('<Panel><Item><Label /></Item><Item><Label /></Item><Item><Button /></Item></Panel>'), {rules}).messages, []);
});

test('declared separators distinguish repeatable groups with the same name', () => {
    const rules = createComponentRules([entry('Panel', [
        entry('Item', [entry('Label')], ['optional', 'repeatable']),
        entry('Divider'),
        entry('Item', [entry('Button')], ['required', 'repeatable']),
    ])]);
    for (const prefix of ['', '<Item><Label /></Item>', '<Item><Label /></Item><Item><Label /></Item>']) {
        const markup = template(`<Panel>${prefix}<Divider /><Item><Button /></Item><Item><Button /></Item></Panel>`);
        assert.deepEqual(lint(markup, {rules}).messages, []);
    }
});

test('blank lines surround whole repeatable groups and preserve gaps inside them', () => {
    const rules = createComponentRules([entry('Panel', [
        entry('Header'), blank(), entry('Item', undefined, ['optional', 'repeatable']), blank(), entry('Footer'),
    ])]);
    const markup = template('<Panel>\n<Header />\n<!-- Items -->\n<Item />\n<Item />\n<Footer />\n</Panel>');
    const expected = markup.replace('<Header />\n', '<Header />\n\n').replace('<Item />\n<Footer />', '<Item />\n\n<Footer />');
    assert.equal(fixed(markup, {rules}), expected);
    assert.equal(fixed(template('<Panel>\n<Header />\n<Footer />\n</Panel>'), {rules}), template('<Panel>\n<Header />\n\n<Footer />\n</Panel>'));

    const adjacentGroups = createComponentRules([entry('Panel', [
        entry('Before', undefined, ['required', 'repeatable']), blank(), entry('After', undefined, ['required', 'repeatable']),
    ])]);
    assert.equal(fixed(template('<Panel>\n<Before />\n<Before />\n<After />\n<After />\n</Panel>'), {rules: adjacentGroups}), template('<Panel>\n<Before />\n<Before />\n\n<After />\n<After />\n</Panel>'));
});

test('comments and layout are checked separately for every repeated child', () => {
    const rules = createComponentRules([entry('Panel', [
        comment(), entry('Item', [source('Label', ['required', 'one-liner'])], ['required', 'repeatable']),
    ])]);
    const markup = template('<Panel>\n<Item><Label>\nFirst\n</Label></Item>\n<Item><Label>\nSecond\n</Label></Item>\n</Panel>');
    const output = fixed(markup, {rules});
    assert.ok(output.includes('<!-- First -->\n<Item><Label> First </Label></Item>'));
    assert.ok(output.includes('<!-- Second -->\n<Item><Label> Second </Label></Item>'));
});

test('transparent groups repeat sibling pairs and reserve the final item', () => {
    const page = '<BreadcrumbItem><BreadcrumbPage>Current page</BreadcrumbPage></BreadcrumbItem>';
    const pair = '<BreadcrumbItem><BreadcrumbLink href="/parent">Parent</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator />';
    for (const count of [0, 1, 4]) {
        const markup = template(`<!-- Navigation -->\n<Breadcrumb><BreadcrumbList>${pair.repeat(count)}${page}</BreadcrumbList></Breadcrumb>`);
        const output = fixed(markup, {rules: breadcrumbRules});
        assert.ok(output.includes('<!-- Navigation -->\n<Breadcrumb>'));
        assert.equal(output.split('<!-- Parent -->').length - 1, count);
        assert.equal(output.split('<!-- Separator -->\n<BreadcrumbSeparator').length - 1, count);
        assert.ok(output.includes('<!-- Current page -->\n<BreadcrumbItem>'));
    }
    const collapsed = template(`<!-- Navigation -->\n<Breadcrumb><BreadcrumbList>${pair}\n<!-- More pages -->\n<BreadcrumbItem><BreadcrumbEllipsis /></BreadcrumbItem><BreadcrumbSeparator />${page}</BreadcrumbList></Breadcrumb>`);
    assert.match(fixed(collapsed, {rules: breadcrumbRules}), /<!-- Current page -->/);

    const emptyList = lint(template('<Breadcrumb><BreadcrumbList /></Breadcrumb>'), {rules: breadcrumbRules, only: ['breadcrumb-must-follow-structure']});
    assert.deepEqual(emptyList.messages.map((message) => message.messageId), ['missing']);
    assert.match(emptyList.messages[0].message, /Add <BreadcrumbItem> directly inside <BreadcrumbList>/);
});

test('Breadcrumb reports missing, misplaced, and trailing separators without moving content', () => {
    const item = '<BreadcrumbItem><BreadcrumbLink>Parent</BreadcrumbLink></BreadcrumbItem>';
    const page = '<BreadcrumbItem><BreadcrumbPage>Current</BreadcrumbPage></BreadcrumbItem>';
    const separator = '<BreadcrumbSeparator />';
    for (const content of [
        item + page, item + separator + item + page,
        separator + item + page, item + separator + page + separator,
        item + item + separator + separator + page,
    ]) {
        const markup = template(`<Breadcrumb><BreadcrumbList>${content}</BreadcrumbList></Breadcrumb>`);
        const result = lint(markup, {rules: breadcrumbRules, only: ['breadcrumb-must-follow-structure'], fix: true});
        assert.equal(result.output, markup);
        assert.ok(result.messages.length, content);
        assert.ok(result.messages.every((message) => !message.message.includes('Group') && !message.message.includes('structure[')));
    }
    const missingAndReordered = lint(template(`<Breadcrumb><BreadcrumbList>${separator}${item}${separator}${page}</BreadcrumbList></Breadcrumb>`), {rules: breadcrumbRules, only: ['breadcrumb-must-follow-structure']});
    assert.equal(missingAndReordered.messages.find((message) => message.messageId === 'order').message,
        'Reorder the direct children of <BreadcrumbList> as: <BreadcrumbItem>, <BreadcrumbSeparator>, <BreadcrumbItem>, <BreadcrumbSeparator>, <BreadcrumbItem>. Preserve their content and bindings.');
});

test('Breadcrumb alternatives require exactly one link or ellipsis', () => {
    const options = {rules: breadcrumbRules, only: ['breadcrumb-must-follow-structure']};
    const trail = (content) => template(`<Breadcrumb><BreadcrumbList><BreadcrumbItem>${content}</BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>Current</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>`);
    const missing = lint(trail(''), options);
    assert.deepEqual(missing.messages.map((message) => message.messageId), ['choiceMissing']);
    assert.equal(missing.messages[0].message, 'Add exactly one of <BreadcrumbLink> or <BreadcrumbEllipsis> directly inside <BreadcrumbItem>. Preserve existing content and bindings.');
    const multiple = lint(trail('<BreadcrumbLink>Parent</BreadcrumbLink><BreadcrumbEllipsis />'), options);
    assert.deepEqual(multiple.messages.map((message) => message.messageId), ['choiceMultiple']);
    assert.match(multiple.messages[0].message, /Keep exactly one of <BreadcrumbLink> or <BreadcrumbEllipsis>/);
});

test('transparent groups preserve real parent checks and source prop validation', () => {
    const names = ['BreadcrumbItem', 'BreadcrumbSeparator', 'BreadcrumbLink', 'BreadcrumbEllipsis', 'BreadcrumbPage'];
    const orphaned = lint(template(`<section>${names.map((name) => `<${name} />`).join('')}</section>`), {rules: breadcrumbRules});
    assert.deepEqual(orphaned.messages.map((message) => message.messageId), names.map(() => 'misplaced'));
    assert.ok(orphaned.messages.every((message) => !message.message.includes('Group')));
    const wrapped = lint(template('<Breadcrumb><BreadcrumbList><div><BreadcrumbItem><BreadcrumbPage>Current</BreadcrumbPage></BreadcrumbItem></div></BreadcrumbList></Breadcrumb>'), {rules: breadcrumbRules, only: ['breadcrumb-must-follow-structure']});
    assert.ok(wrapped.messages.some((message) => message.messageId === 'misplaced' && message.message.includes('<BreadcrumbList>')));
    const invalidProp = lint(template('<!-- Current -->\n<Breadcrumb><BreadcrumbList><BreadcrumbItem><BreadcrumbLink as-child="invalid">Parent</BreadcrumbLink></BreadcrumbItem><BreadcrumbSeparator /><BreadcrumbItem><BreadcrumbPage>Current</BreadcrumbPage></BreadcrumbItem></BreadcrumbList></Breadcrumb>'), {rules: breadcrumbRules, only: ['breadcrumb-must-have-valid-props']});
    assert.deepEqual(invalidProp.messages.map((message) => message.messageId), ['propValue']);
    assert.match(invalidProp.messages[0].message, /Set as-child on <BreadcrumbLink> to boolean/);
});

test('comments, blank lines, and layout work independently in each transparent group occurrence', () => {
    const rules = createComponentRules([entry('Panel', [
        entry('Group', [comment(), entry('PanelItem', [source('Label', ['required', 'one-liner'])]), blank(), entry('PanelSeparator')], ['optional', 'repeatable']),
        entry('PanelFooter'),
    ])]);
    const contents = ['First', 'Second'].map((text) => `<PanelItem>\n    <Label>\n        ${text}\n    </Label>\n</PanelItem>\n<PanelSeparator />`).join('\n');
    const output = fixed(template(`<Panel>\n${contents}\n<PanelFooter />\n</Panel>`), {rules});
    for (const text of ['First', 'Second']) assert.ok(output.includes(`<!-- ${text} -->\n<PanelItem>\n    <Label>${text}</Label>`));
    assert.equal(output.split('</PanelItem>\n\n<PanelSeparator />').length - 1, 2);
    assert.deepEqual(lint(template('<Panel><PanelFooter /></Panel>'), {rules}).messages, []);
});

test('group presence and alternatives are generic and reserve later required choices', () => {
    const pairs = entry('Group', [entry('PanelItem'), entry('PanelSeparator')], ['optional', 'repeatable']);
    const choice = entry('Group', [entry('PanelItem'), entry('PanelEnd')], ['required', 'one-of']);
    const rules = createComponentRules([entry('Panel', [pairs, choice])]);
    for (const ending of ['<PanelItem />', '<PanelEnd />']) {
        assert.deepEqual(lint(template(`<Panel>${ending}</Panel>`), {rules}).messages, []);
        assert.deepEqual(lint(template(`<Panel><PanelItem /><PanelSeparator />${ending}</Panel>`), {rules}).messages, []);
    }
    const repeated = createComponentRules([entry('Panel', [entry('PanelItem', undefined, ['required', 'repeatable']), choice])]);
    for (const ending of ['<PanelItem />', '<PanelEnd />']) {
        assert.deepEqual(lint(template(`<Panel><PanelItem /><PanelItem />${ending}</Panel>`), {rules: repeated}).messages, []);
    }
    const required = createComponentRules([entry('Panel', [entry('Group', [entry('PanelItem'), entry('PanelSeparator')])])]);
    const result = lint(template('<Panel />'), {rules: required});
    assert.deepEqual(result.messages.map((message) => message.messageId), ['missing', 'missing']);
    assert.ok(result.messages.every((message) => /directly inside <Panel>/.test(message.message)));
});

test('group definitions reject ambiguous or element-only flags', () => {
    for (const group of [
        entry('Group'), entry('Group', []), entry('Group', [entry('Item', undefined, ['optional'])]),
        entry('Group', [entry('Item')], ['required', 'one-liner']),
        entry('Group', [entry('Item')], ['required', 'comment-source']),
        entry('Group', [entry('Item')], ['required', 'repeatable', 'one-of']),
        entry('Group', [entry('Item', undefined, ['required', 'repeatable'])]),
        entry('Group', [entry('Group', [entry('Item')])]),
        entry('Group', [comment(), entry('Item')], ['required', 'one-of']),
    ]) assert.throws(() => createComponentRules([entry('Panel', [group])]), /Invalid component structure/);
    assert.throws(() => createComponentRules([entry('Group', [entry('Item')])]), /Group must be inside a component/);
    assert.throws(() => createComponentRules([entry('Panel', undefined, ['required', 'one-of'])]), /one-of can only be declared on Group/);
});

test('Accordion validates every repeated item and falls back to the next usable trigger', () => {
    const markup = template(`<Accordion>
    <AccordionItem value="first">
        <AccordionTrigger>{{ heading }}</AccordionTrigger>
        <AccordionContent>First answer</AccordionContent>
    </AccordionItem>
    <AccordionItem value="second">
        <AccordionTrigger>
            Second question
        </AccordionTrigger>
        <AccordionContent>Second answer</AccordionContent>
    </AccordionItem>
</Accordion>`);
    const output = fixed(markup, {rules: accordionRules});
    assert.ok(output.includes('<!-- Second question -->\n<Accordion>'));
    assert.ok(output.includes('<AccordionTrigger>Second question</AccordionTrigger>'));
    assert.equal((output.match(/<\/AccordionTrigger>\n\n        <AccordionContent>/g) ?? []).length, 2);
    const missing = output.replace('        <AccordionContent>Second answer</AccordionContent>\n', '');
    assert.deepEqual(lint(missing, {rules: accordionRules}).messages.map((message) => message.messageId), ['missing']);
    assert.equal(lint(missing, {rules: accordionRules}).messages[0].message, 'Add <AccordionContent> directly inside <AccordionItem>, after <AccordionTrigger>. Preserve existing content and bindings.');
    const backwards = output.replace('<AccordionTrigger>Second question</AccordionTrigger>\n\n        <AccordionContent>Second answer</AccordionContent>', '<AccordionContent>Second answer</AccordionContent>\n\n        <AccordionTrigger>Second question</AccordionTrigger>');
    assert.deepEqual(lint(backwards, {rules: accordionRules}).messages.map((message) => message.messageId), ['order']);
});

test('Attachment works alone and in groups, with per-item comments and repeatable actions', () => {
    const item = `<Attachment state="done">
    <AttachmentTrigger />
    <AttachmentMedia variant="image"><img src="/preview.png" alt="Preview" /></AttachmentMedia>
    <AttachmentContent>
        <AttachmentTitle>
            Report.pdf
        </AttachmentTitle>
        <AttachmentDescription>24 KB</AttachmentDescription>
    </AttachmentContent>
    <AttachmentActions>
        <AttachmentAction>Download</AttachmentAction>
        <AttachmentAction>Remove</AttachmentAction>
        <AttachmentAction>
            ↓
        </AttachmentAction>
    </AttachmentActions>
</Attachment>`;
    const markup = template(`<AttachmentGroup>\n${item}\n${item.replace('Report.pdf', 'Invoice.pdf')}\n</AttachmentGroup>\n${item.replace('Report.pdf', 'Standalone.pdf')}`);
    const output = fixed(markup, {rules: attachmentRules});
    for (const title of ['Report.pdf', 'Invoice.pdf', 'Standalone.pdf']) {
        assert.ok(output.includes(`<!-- ${title} -->`));
        assert.ok(output.includes(`<AttachmentTitle>${title}</AttachmentTitle>`));
    }
    for (const label of ['Download', 'Remove', '↓']) {
        assert.equal(output.split(`<!-- ${label} -->\n        <AttachmentAction>`).length - 1, 3);
    }
    const minimal = template('<!-- Notes.txt -->\n<Attachment><AttachmentContent><AttachmentTitle>Notes.txt</AttachmentTitle></AttachmentContent></Attachment>');
    assert.deepEqual(lint(minimal, {rules: attachmentRules}).messages, []);
});

test('AttachmentGroup and optional actions enforce membership without restricting standalone attachments', () => {
    const options = {rules: attachmentRules, only: ['attachment-must-follow-structure', 'attachmentgroup-must-follow-structure']};
    const emptyGroup = lint(template('<AttachmentGroup />'), options);
    assert.deepEqual(emptyGroup.messages.map((message) => message.messageId), ['missing']);
    assert.match(emptyGroup.messages[0].message, /Add <Attachment> directly inside <AttachmentGroup>/);
    const missingAction = lint(template('<Attachment><AttachmentContent><AttachmentTitle>File</AttachmentTitle></AttachmentContent><AttachmentActions /></Attachment>'), options);
    assert.deepEqual(missingAction.messages.map((message) => message.messageId), ['missing']);
    assert.match(missingAction.messages[0].message, /Add <AttachmentAction> directly inside <AttachmentActions>/);
    const orphan = lint(template('<section><AttachmentTitle>File</AttachmentTitle><AttachmentAction>Remove</AttachmentAction></section>'), options);
    assert.deepEqual(orphan.messages.map((message) => message.messageId), ['misplaced', 'misplaced']);
    const wrapped = lint(template('<AttachmentGroup><section><Attachment><AttachmentContent><AttachmentTitle>File</AttachmentTitle></AttachmentContent></Attachment></section></AttachmentGroup>'), options);
    assert.deepEqual(wrapped.messages.map((message) => message.messageId), ['missing', 'unexpected']);
});

test('grouped Attachment props are checked once against custom and inherited source types', () => {
    const markup = template(`<AttachmentGroup>
<!-- Report.pdf -->
<Attachment state="invalid">
    <AttachmentMedia variant="video" />

    <AttachmentContent><AttachmentTitle>Report.pdf</AttachmentTitle></AttachmentContent>

    <AttachmentActions>
        <!-- Download -->
        <AttachmentAction size="giant">Download</AttachmentAction>
    </AttachmentActions>
</Attachment>
</AttachmentGroup>`);
    const result = lint(markup, {rules: attachmentRules});
    assert.deepEqual(result.messages.map((message) => message.messageId), ['propValue', 'propValue', 'propValue']);
    assert.ok(result.messages.every((message) => message.ruleId === 'escore/attachment-must-have-valid-props'));
    assert.match(result.messages[0].message, /Set state on <Attachment>/);
    assert.match(result.messages[1].message, /Set variant on <AttachmentMedia>/);
    assert.match(result.messages[2].message, /Set size on <AttachmentAction>/);
});

test('BubbleGroup validates its own props without reporting nested Bubble props twice', () => {
    const markup = template(`<BubbleGroup as-child="invalid">
    <Bubble variant="invalid">
        <BubbleContent as-child="invalid">Hello</BubbleContent>
        <BubbleReactions side="sideways" align="center" variant="invalid">👍</BubbleReactions>
    </Bubble>
    <Bubble align="center"><BubbleContent>Another message</BubbleContent></Bubble>
</BubbleGroup>`);
    const result = lint(markup, {rules: bubbleRules, only: ['bubblegroup-must-have-valid-props', 'bubble-must-have-valid-props']});
    assert.equal(result.messages.length, 7);
    assert.ok(result.messages.every((message) => message.messageId === 'propValue'));
    assert.equal(result.messages.filter((message) => message.ruleId === 'escore/bubblegroup-must-have-valid-props').length, 1);
    assert.match(result.messages[0].message, /Set as-child on <BubbleGroup> to boolean/);
    assert.equal(new Set(result.messages.map((message) => `${message.line}:${message.column}`)).size, 7);
    assert.throws(() => createComponentRules([entry('Panel')], {propsScope: 'invalid'}), /propsScope must be all, root, or family/);
});

test('Button comments and multiline layout settle together in every context', () => {
    const output = fixed(template('<Button type="button" variant="primary" size="sm">Save</Button>'), {rules: buttonRules});
    assert.equal(output, template('<!-- Save -->\n<Button type="button" variant="primary" size="sm">\n    Save\n</Button>'));
    const options = {rules: buttonRules, only: ['button-must-have-valid-comments']};
    for (const parent of ['ComboboxTrigger', 'ContextMenuTrigger', 'DialogClose', 'AlertDialogCancel', 'AlertDialogAction', 'DropdownMenuTrigger', 'PopoverTrigger', 'nav', 'CreatePortfolioDialog', 'TableHead']) {
        assert.match(fixed(template(`<${parent}><Button>Save</Button></${parent}>`), options), /<!-- Save -->\n<Button>/);
    }
    assert.deepEqual(lint(template('<button>Native</button>'), {rules: buttonRules}).messages, []);
});

test('Button requires content even with a descriptive comment, without inventing a fix', () => {
    const options = {rules: buttonRules, only: ['button-must-follow-structure'], fix: true};
    for (const markup of ['<Button />', '<Button></Button>', '<Button>\n    \t\n</Button>', '<Button><!-- Placeholder -->\n</Button>', '<Button>&nbsp; &#32;</Button>']) {
        const sourceCode = template(`<!-- Example of an unlabeled default button. -->\n${markup}`);
        const result = lint(sourceCode, options);
        assert.deepEqual(result.messages.map(({ruleId, messageId, message}) => ({ruleId, messageId, message})), [{
            ruleId: 'escore/button-must-follow-structure',
            messageId: 'empty',
            message: 'Add content inside <Button>: text, an interpolation, or a child element.',
        }]);
        assert.equal(result.fixed, false);
        assert.equal(result.output, sourceCode);
    }
    for (const content of ['Save', '{{ label }}', '<Icon />', '<span>Save</span>', '<slot />']) {
        assert.deepEqual(lint(template(`<Button>${content}</Button>`), options).messages, []);
    }
    assert.deepEqual(lint(template('<button />'), options).messages, []);
    const example = template('<!-- Example of an unlabeled default button. -->\n<Button>\n</Button>');
    assert.deepEqual(lint(example, {rules: buttonRules}).messages.map((message) => message.messageId), ['empty']);
});

test('non-empty works on other components and every present optional or repeated child', () => {
    const rules = createComponentRules([entry('Panel', [
        entry('Item', undefined, ['optional', 'repeatable', 'non-empty']),
        entry('Footer', undefined, ['optional']),
    ], ['required', 'non-empty'])]);
    assert.deepEqual(lint(template('<Panel />'), {rules}).messages.map((message) => message.message), [
        'Add content inside <Panel>: text, an interpolation, or a child element.',
    ]);
    assert.deepEqual(lint(template('<Panel><Item /><Item>Ready</Item><Item><!-- Placeholder --></Item><Footer /></Panel>'), {rules}).messages.map((message) => message.message), [
        'Add content inside <Item>: text, an interpolation, or a child element.',
        'Add content inside <Item>: text, an interpolation, or a child element.',
    ]);
    assert.deepEqual(lint(template('<Panel><Footer /></Panel>'), {rules}).messages, []);
    assert.deepEqual(lint(template('<div />'), {rules}).messages, []);
});

test('non-empty rejects declarations that do not represent an element', () => {
    for (const structure of [
        [entry('Comment', undefined, ['required', 'non-empty']), entry('Panel')],
        [entry('Panel', [entry('Header'), entry('BlankLine', undefined, ['required', 'non-empty']), entry('Footer')])],
        [entry('Panel', [entry('Group', [entry('Item')], ['required', 'non-empty'])])],
    ]) assert.throws(() => createComponentRules(structure), /non-empty can only be declared on a component/);
});

test('ButtonGroup requires a descriptive comment and leaves each Button comment to its own rules', () => {
    const rules = {...buttonGroupRules, ...buttonRules};
    const options = {rules, only: ['buttongroup-must-have-valid-comments', 'button-must-have-valid-comments']};
    const markup = template('<ButtonGroup>\n    <Button>Save</Button>\n    <Button>Cancel</Button>\n</ButtonGroup>');
    const result = lint(markup, {...options, fix: true});
    assert.deepEqual(result.messages.map((message) => message.ruleId), ['escore/buttongroup-must-have-valid-comments']);
    assert.equal(result.messages[0].messageId, 'commentManual');
    assert.match(result.output, /<!-- Save -->\n    <Button>/);
    assert.match(result.output, /<!-- Cancel -->\n    <Button>/);
    const annotated = result.output.replace('<ButtonGroup>', '<!-- Project actions -->\n<ButtonGroup>');
    assert.deepEqual(lint(annotated, options).messages, []);
    assert.equal(lint(annotated, {...options, fix: true}).fixed, false);
});

test('ButtonGroup validates its orientation from source and ignores dynamic values', () => {
    const options = {rules: buttonGroupRules, only: ['buttongroup-must-have-valid-props']};
    for (const attributes of ['', 'orientation="horizontal"', 'orientation="vertical"', ':orientation="orientation"']) {
        assert.deepEqual(lint(template(`<ButtonGroup ${attributes}><Button>Save</Button></ButtonGroup>`), options).messages, []);
    }
    const result = lint(template('<ButtonGroup orientation="diagonal"><Button>Save</Button></ButtonGroup>'), {...options, fix: true});
    assert.deepEqual(result.messages.map((message) => message.messageId), ['propValue']);
    assert.match(result.messages[0].message, /Set orientation on <ButtonGroup> to .*received "diagonal"/);
    assert.match(result.messages[0].message, /"horizontal"/);
    assert.match(result.messages[0].message, /"vertical"/);
    assert.equal(result.fixed, false);
});

test('ButtonGroup accepts mixed repeated children and nested groups in any order', () => {
    const options = {rules: buttonGroupRules, only: ['buttongroup-must-follow-structure']};
    for (const contents of [
        '<Button>Save</Button><Button>Cancel</Button>',
        '<ButtonGroupText>Actions</ButtonGroupText><Button>Save</Button><ButtonGroupSeparator /><Button>More</Button>',
        '<Button>Save</Button><ButtonGroupText>Actions</ButtonGroupText><ButtonGroupSeparator /><Button>More</Button><ButtonGroupText>End</ButtonGroupText>',
        '<Input /><Select /><Button>Search</Button><DropdownMenu />',
        '<ButtonGroup><Button>Previous</Button><Button>Next</Button></ButtonGroup><ButtonGroupSeparator /><ButtonGroup><Button>Close</Button></ButtonGroup>',
    ]) assert.deepEqual(lint(template(`<ButtonGroup>${contents}</ButtonGroup>`), options).messages, []);
    assert.deepEqual(lint(template('<button-group><button-group-text>Actions</button-group-text><button-group-separator /><Button>Save</Button></button-group>'), options).messages, []);
    for (const contents of ['', '<!-- Placeholder -->']) {
        assert.deepEqual(lint(template(`<ButtonGroup>${contents}</ButtonGroup>`), options).messages.map((message) => message.messageId), ['empty']);
    }
    for (const markup of [
        '<ButtonGroup><div><Button>Save</Button></div></ButtonGroup>',
        '<ButtonGroup>Loose text</ButtonGroup>',
        '<ButtonGroup><Unlisted /></ButtonGroup>',
    ]) assert.deepEqual(lint(template(markup), options).messages.map((message) => message.messageId), ['unexpected']);
    const orphans = lint(template('<ButtonGroupText>Actions</ButtonGroupText><button-group-separator />'), options);
    assert.deepEqual(orphans.messages.map((message) => message.messageId), ['misplaced', 'misplaced']);
    assert.ok(orphans.messages.every((message) => message.message.includes('directly inside <ButtonGroup>')));
    assert.deepEqual(lint(template('<ButtonGroup><section><ButtonGroupText>Actions</ButtonGroupText></section></ButtonGroup>'), options).messages.map((message) => message.messageId), ['unexpected', 'misplaced']);
    assert.deepEqual(lint(template('<Button>Standalone</Button>'), options).messages, []);
});

test('ButtonGroup validates family and nested root props once while Button handles its own props', () => {
    const rules = {...buttonGroupRules, ...buttonRules};
    const result = lint(template(`<ButtonGroup orientation="diagonal">
    <ButtonGroupText orientation="diagonal">Actions</ButtonGroupText>
    <ButtonGroupSeparator orientation="diagonal" decorative="invalid" />
    <ButtonGroup orientation="diagonal"><Button variant="invalid">Save</Button></ButtonGroup>
</ButtonGroup>`), {rules, only: ['buttongroup-must-have-valid-props', 'button-must-have-valid-props']});
    assert.equal(result.messages.length, 6);
    assert.ok(result.messages.every((message) => message.messageId === 'propValue'));
    assert.equal(result.messages.filter((message) => message.ruleId === 'escore/buttongroup-must-have-valid-props').length, 5);
    assert.equal(result.messages.filter((message) => message.ruleId === 'escore/button-must-have-valid-props').length, 1);
});

test('ButtonGroup comments and text layout apply independently at each nesting level', () => {
    const markup = template(`<ButtonGroup>
    <ButtonGroupText>
        Actions
    </ButtonGroupText>
    <ButtonGroup><Button>Save</Button></ButtonGroup>
</ButtonGroup>`);
    const result = lint(markup, {rules: buttonGroupRules, fix: true});
    assert.deepEqual(result.messages.map((message) => message.messageId), ['commentManual', 'commentManual']);
    assert.ok(result.output.includes('<ButtonGroupText>Actions</ButtonGroupText>'));
    const annotated = result.output.replace('<ButtonGroup>', '<!-- Project actions -->\n<ButtonGroup>')
        .replace('    <ButtonGroup>', '    <!-- Save actions -->\n    <ButtonGroup>');
    assert.deepEqual(lint(annotated, {rules: buttonGroupRules}).messages, []);
    assert.equal(lint(annotated, {rules: buttonGroupRules, fix: true}).fixed, false);
});

test('unordered changes only direct child order and preserves required, repeated, and nested structure checks', () => {
    const rules = createComponentRules([entry('Panel', [
        entry('PanelHeader'),
        entry('PanelItem', [entry('Title'), entry('Body')], ['optional', 'repeatable']),
        entry('PanelFooter', undefined, ['optional']),
    ], ['required', 'unordered'])]);
    const item = '<PanelItem><Title /><Body /></PanelItem>';
    assert.deepEqual(lint(template(`<Panel>${item}<PanelFooter /><PanelHeader />${item}</Panel>`), {rules}).messages, []);
    assert.deepEqual(lint(template(`<Panel>${item}</Panel>`), {rules}).messages.map((message) => message.message), [
        'Add <PanelHeader> directly inside <Panel>. Preserve existing content and bindings.',
    ]);
    assert.deepEqual(lint(template('<Panel><PanelHeader /><PanelItem><Body /><Title /></PanelItem></Panel>'), {rules}).messages.map((message) => message.messageId), ['order']);
    assert.deepEqual(lint(template('<Panel><PanelHeader /><PanelHeader /></Panel>'), {rules}).messages.map((message) => message.messageId), ['unexpected']);
});

test('unordered rejects special entries and ambiguous ordered patterns', () => {
    for (const structure of [
        [entry('Comment', undefined, ['required', 'unordered']), entry('Panel')],
        [entry('Panel', [entry('Header'), entry('BlankLine', undefined, ['required', 'unordered']), entry('Footer')])],
        [entry('Panel', [entry('Group', [entry('Item')], ['required', 'unordered'])])],
        [entry('Panel', undefined, ['required', 'unordered'])],
        [entry('Panel', [], ['required', 'unordered'])],
        [entry('Panel', [entry('Header'), blank(), entry('Footer')], ['required', 'unordered'])],
        [entry('Panel', [entry('Group', [entry('Item')])], ['required', 'unordered'])],
        [entry('Panel', [entry('Item'), entry('Item')], ['required', 'unordered'])],
    ]) assert.throws(() => createComponentRules(structure), /Invalid component structure/);
});

test('Calendar keeps self-contained rendering and named slot overrides, with a manual comment', () => {
    for (const markup of [
        '<Calendar />',
        '<Calendar v-model="date" layout="month-and-year" />',
        `<Calendar>
    <template #calendar-heading="{ date }"><span>{{ date.year }}</span></template>
    <template #calendar-prev-icon><ArrowLeft /></template>
    <template #calendar-next-icon><ArrowRight /></template>
</Calendar>`,
    ]) {
        const sourceCode = template(markup);
        const missing = lint(sourceCode, {rules: calendarRules, fix: true});
        assert.deepEqual(missing.messages.map((message) => message.messageId), ['commentManual']);
        assert.equal(missing.output, sourceCode);
        assert.equal(missing.fixed, false);
        assert.deepEqual(lint(template(`<!-- Choose a delivery date -->\n${markup}`), {rules: calendarRules}).messages, []);
    }
});

test('Calendar validates custom layout and inherited calendar props from source', () => {
    const options = {rules: calendarRules, only: ['calendar-must-have-valid-props']};
    for (const layout of ['month-and-year', 'month-only', 'year-only']) {
        assert.deepEqual(lint(template(`<Calendar layout="${layout}" :week-starts-on="1" weekday-format="short" :number-of-months="2" fixed-weeks />`), options).messages, []);
    }
    assert.deepEqual(lint(template('<Calendar :layout="layout" :year-range="years" v-model="date" />'), options).messages, []);
    const result = lint(template('<Calendar layout="decade" :week-starts-on="7" weekday-format="wide" number-of-months="2" />'), {...options, fix: true});
    assert.equal(result.messages.length, 4);
    assert.ok(result.messages.every((message) => message.messageId === 'propValue'));
    for (const prop of ['layout', 'week-starts-on', 'weekday-format', 'number-of-months']) {
        assert.ok(result.messages.some((message) => message.message.includes(`Set ${prop} on <Calendar>`)));
    }
    assert.equal(result.fixed, false);
});

test('Caption requires content and infers comments while settling one-line layout', () => {
    const output = fixed(template('<Caption variant="muted">\n    Account settings\n</Caption>'), {rules: captionRules});
    assert.equal(output, template('<!-- Account settings -->\n<Caption variant="muted">Account settings</Caption>'));
    for (const contents of ['{{ label }}', '<InfoIcon /> Settings']) {
        const markup = template(`<Caption>${contents}</Caption>`);
        const result = lint(markup, {rules: captionRules, fix: true});
        assert.deepEqual(result.messages.map((message) => message.messageId), ['commentManual']);
        assert.equal(result.output, markup);
        assert.deepEqual(lint(template(`<!-- Account settings -->\n<Caption>${contents}</Caption>`), {rules: captionRules}).messages, []);
    }
    for (const markup of ['<Caption />', '<Caption> \n </Caption>', '<Caption><!-- Placeholder --></Caption>']) {
        assert.deepEqual(lint(template(markup), {rules: captionRules, only: ['caption-must-follow-structure']}).messages.map((message) => message.messageId), ['empty']);
    }
    assert.deepEqual(lint(template('<table><caption>Native table caption</caption></table>'), {rules: captionRules}).messages, []);
});

test('Caption validates custom variants and Primitive props from source', () => {
    const options = {rules: captionRules, only: ['caption-must-have-valid-props']};
    for (const variant of ['subtle', 'muted', 'foreground', 'inherit']) {
        assert.deepEqual(lint(template(`<Caption variant="${variant}" as="span">Label</Caption>`), options).messages, []);
    }
    assert.deepEqual(lint(template('<Caption :variant="variant" as-child><span>Label</span></Caption>'), options).messages, []);
    const result = lint(template('<Caption variant="primary" as-child="yes">Label</Caption>'), options);
    assert.deepEqual(result.messages.map((message) => message.messageId), ['propValue', 'propValue']);
    assert.match(result.messages[0].message, /Set variant on <Caption>/);
    assert.match(result.messages[1].message, /Set as-child on <Caption> to boolean/);
});

test('Card comments, text layout, and section spacing settle with optional description, action, and footer', () => {
    const markup = template(`<Card>
    <CardHeader>
        <CardTitle>
            Project settings
        </CardTitle>
        <CardDescription>
            Manage this project.
        </CardDescription>
        <CardAction><Button>Help</Button></CardAction>
    </CardHeader>
    <CardContent><form><Input /></form></CardContent>
    <CardFooter><Button>Save</Button></CardFooter>
</Card>`);
    const output = fixed(markup, {rules: cardRules});
    assert.ok(output.includes('<!-- Project settings -->\n<Card>'));
    assert.ok(output.includes('<CardTitle>Project settings</CardTitle>'));
    assert.ok(output.includes('<CardDescription>Manage this project.</CardDescription>'));
    assert.ok(output.includes('</CardHeader>\n\n    <CardContent>'));
    assert.ok(output.includes('</CardContent>\n\n    <CardFooter>'));
    const minimal = fixed(template(`<Card>
    <CardHeader><CardTitle>Project settings</CardTitle></CardHeader>
    <CardContent><p>Details</p></CardContent>
</Card>`), {rules: cardRules});
    assert.ok(minimal.includes('</CardContent>\n</Card>'), 'missing optional footer must not add a trailing blank line');
});

test('Card requires direct header, title, and content, enforces order, and rejects orphaned family parts', () => {
    const options = {rules: cardRules, only: ['card-must-follow-structure'], fix: true};
    const header = '<CardHeader><CardTitle>Title</CardTitle></CardHeader>';
    const content = '<CardContent>Body</CardContent>';
    assert.deepEqual(lint(template('<Card />'), options).messages.map((message) => message.messageId), ['missing', 'missing']);
    const missingTitle = lint(template(`<Card><CardHeader />${content}</Card>`), options);
    assert.deepEqual(missingTitle.messages.map((message) => message.message), ['Add <CardTitle> directly inside <CardHeader>. Preserve existing content and bindings.']);
    const backwards = template(`<Card>${header}<CardFooter>Actions</CardFooter>${content}</Card>`);
    const result = lint(backwards, options);
    assert.deepEqual(result.messages.map((message) => message.messageId), ['order']);
    assert.equal(result.fixed, false);
    assert.equal(result.output, backwards);
    assert.deepEqual(lint(template(`<Card>${header}${content}${content}</Card>`), options).messages.map((message) => message.messageId), ['unexpected']);
    const wrapped = lint(template(`<Card><section>${header}</section>${content}</Card>`), options);
    assert.deepEqual(wrapped.messages.map((message) => message.messageId).sort(), ['misplaced', 'missing', 'unexpected']);
    for (const [name, parent] of [
        ['CardHeader', 'Card'], ['CardTitle', 'CardHeader'], ['CardDescription', 'CardHeader'],
        ['CardAction', 'CardHeader'], ['CardContent', 'Card'], ['CardFooter', 'Card'],
    ]) {
        const orphan = lint(template(`<section><${name} /></section>`), options);
        assert.deepEqual(orphan.messages.map((message) => message.messageId), ['misplaced']);
        assert.match(orphan.messages[0].message, new RegExp(`directly inside <${parent}>`));
    }
    const kebab = `<Card><card-header><card-title>Title</card-title></card-header><card-content>Body</card-content></Card>`;
    assert.deepEqual(lint(template(kebab), options).messages, []);
    const emptyContent = lint(template(`<Card>${header}<CardContent><!-- Placeholder --></CardContent></Card>`), options);
    assert.deepEqual(emptyContent.messages.map((message) => message.messageId), ['empty']);
});

test('Card uses title then description as comment sources in every context', () => {
    const options = {rules: cardRules, only: ['card-must-have-valid-comments']};
    const card = '<Card><CardHeader><CardTitle>Settings</CardTitle><CardDescription>Project preferences</CardDescription></CardHeader><CardContent>Body</CardContent></Card>';
    for (const parent of ['section', 'Tabs', 'TabsContent', 'PageSectionContent']) {
        assert.ok(fixed(template(`<${parent}>${card}</${parent}>`), options).includes('<!-- Settings -->\n<Card>'));
    }
    const fallback = card.replace('>Settings<', '>{{ title }}<');
    assert.ok(fixed(template(fallback), options).includes('<!-- Project preferences -->\n<Card>'));
    const dynamic = fallback.replace('>Project preferences<', '>{{ description }}<');
    const result = lint(template(dynamic), {...options, fix: true});
    assert.deepEqual(result.messages.map((message) => message.messageId), ['commentManual']);
    assert.equal(result.fixed, false);
    const mismatch = lint(template(`<!-- Wrong title -->\n${card}`), {...options, fix: true});
    assert.deepEqual(mismatch.messages.map((message) => message.messageId), ['commentMismatch']);
    assert.equal(mismatch.fixed, false);
});

test('Card validates its custom opaque prop from source', () => {
    const options = {rules: cardRules, only: ['card-must-have-valid-props']};
    for (const attributes of ['', 'opaque', ':opaque="false"', ':opaque="isOpaque"']) {
        assert.deepEqual(lint(template(`<Card ${attributes} />`), options).messages, []);
    }
    const result = lint(template('<Card opaque="yes" />'), options);
    assert.deepEqual(result.messages.map((message) => message.messageId), ['propValue']);
    assert.match(result.messages[0].message, /Set opaque on <Card> to boolean/);
});

test('Checkbox allows built-in or custom indicators, requires a manual comment, and uses one-line layout', () => {
    for (const markup of ['<Checkbox />', '<Checkbox v-model="accepted" />', '<Checkbox v-slot="{ state }"><CustomCheck :state="state" /></Checkbox>']) {
        const result = lint(template(markup), {rules: checkboxRules, fix: true});
        assert.deepEqual(result.messages.map((message) => message.messageId), ['commentManual']);
        assert.equal(result.output, template(markup));
        assert.deepEqual(lint(template(`<!-- Accept terms -->\n${markup}`), {rules: checkboxRules}).messages, []);
    }
    const output = fixed(template('<!-- Accept terms -->\n<Checkbox\n    id="accept"\n    v-model="accepted"\n/>'), {rules: checkboxRules});
    assert.equal(output, template('<!-- Accept terms -->\n<Checkbox id="accept" v-model="accepted" />'));
    assert.deepEqual(lint(template('<input type="checkbox" />'), {rules: checkboxRules}).messages, []);
});

test('Checkbox validates inherited boolean and indeterminate props from source', () => {
    const options = {rules: checkboxRules, only: ['checkbox-must-have-valid-props']};
    for (const attributes of ['', ':model-value="true"', ':model-value="false"', 'model-value="indeterminate"', 'default-value="indeterminate"', 'v-model="accepted" disabled required']) {
        assert.deepEqual(lint(template(`<Checkbox ${attributes} />`), options).messages, []);
    }
    const result = lint(template('<Checkbox model-value="sometimes" disabled="yes" />'), {...options, fix: true});
    assert.deepEqual(result.messages.map((message) => message.messageId), ['propValue', 'propValue']);
    assert.match(result.messages[0].message, /Set model-value on <Checkbox>/);
    assert.match(result.messages[1].message, /Set disabled on <Checkbox> to boolean/);
    assert.equal(result.fixed, false);
});

test('Button literal comments preserve complete labels, word boundaries, and repeated words', () => {
    const options = {rules: buttonRules, only: ['button-must-have-valid-comments']};
    for (const [body, label] of [
        ['Save <strong>changes</strong>', 'Save changes'],
        ['Log<span>in</span>', 'Login'],
        ['<span>Go</span> <strong>Go</strong>', 'Go Go'],
        ['Save\n  <strong>changes</strong>', 'Save changes'],
    ]) {
        assert.equal(fixed(template(`<Button>${body}</Button>`), options), template(`<!-- ${label} -->\n<Button>${body}</Button>`));
    }
});

test('conditional comment owners retain their own known literal text and attributes', () => {
    const options = {rules: buttonRules, only: ['button-must-have-valid-comments']};
    const attributeRules = createComponentRules([comment(), entry('Panel', undefined, ['required', 'comment-source:data-label'])]);
    for (const directive of ['v-if="visible"', 'v-for="item in items"', 'v-show="visible"']) {
        const markup = `<Button ${directive}>Save</Button>`;
        assert.equal(fixed(template(markup), options), template(`<!-- Save -->\n${markup}`));
        assert.match(fixed(template(`<Panel ${directive} data-label="Panel label" />`), {rules: attributeRules}), /<!-- Panel label -->/);
    }
});

test('Button comments never combine dynamic, conditional, or repeated descendant labels', () => {
    const options = {rules: buttonRules, only: ['button-must-have-valid-comments']};
    for (const body of [
        'Save {{ label }}',
        '<span v-if="ready">Save</span><span v-else>Cancel</span>',
        '<span v-for="item in items">Go</span>',
        'Save <span v-show="details">changes</span>',
        '<span v-text="label" />', '<span v-html="label" />', '<slot />',
    ]) {
        const markup = template(`<Button>${body}</Button>`);
        const result = lint(markup, {...options, fix: true});
        assert.equal(result.output, markup);
        assert.deepEqual(result.messages.map((message) => message.messageId), ['commentManual']);
        assert.deepEqual(lint(template(`<!-- Descriptive label -->\n<Button>${body}</Button>`), options).messages, []);
    }
    for (const directive of ['v-text="label"', 'v-html="label"']) {
        const markup = template(`<Button ${directive}>Fallback</Button>`);
        assert.equal(lint(markup, {...options, fix: true}).output, markup);
    }
});

test('Empty keeps family prop validation while Button validates its own props once', () => {
    const rules = {...emptyRules, ...buttonRules};
    const markup = empty('\n\n<EmptyContent><Button variant="invalid" size="giant" loading="yes">Save</Button></EmptyContent>', header().replace('<EmptyHeader>', '<EmptyHeader><EmptyMedia variant="invalid" />'));
    const result = lint(markup, {rules, only: ['empty-must-have-valid-props', 'button-must-have-valid-props']});
    assert.equal(result.messages.length, 4);
    assert.equal(result.messages.filter((message) => message.ruleId === 'escore/empty-must-have-valid-props').length, 1);
    assert.equal(result.messages.filter((message) => message.ruleId === 'escore/button-must-have-valid-props').length, 3);
    assert.ok(result.messages.every((message) => message.messageId === 'propValue'));
});

test('controlled AlertDialog comments, header spacing, and one-liners settle with an optional icon', () => {
    const rules = {...alertRules, ...alertDialogRules};
    const markup = `<Button @click="isOpen = true">Open</Button>
<AlertDialog :open="isOpen" @update:open="isOpen = $event">
    <AlertDialogContent>
        <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
                This cannot be undone.
            </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive">Delete</AlertDialogAction>
        </AlertDialogFooter>
    </AlertDialogContent>
</AlertDialog>`;
    for (const withIcon of [false, true]) {
        const content = withIcon
            ? markup.replace('<AlertDialogHeader>\n', '<AlertDialogHeader>\n            <AlertDialogIcon />\n')
            : markup;
        const output = fixed(template(content), {rules});
        assert.match(output, /<!-- Delete project\? -->\n<AlertDialog/);
        assert.match(output, /<AlertDialogDescription>This cannot be undone\.<\/AlertDialogDescription>/);
        assert.match(output, /<\/AlertDialogHeader>\n\n        <AlertDialogFooter>/);
        assert.match(output, /<!-- Cancel -->\n            <AlertDialogCancel>/);
        assert.match(output, /<!-- Delete -->\n            <AlertDialogAction/);
        const missingDescription = output.replace('            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>\n', '');
        assert.equal(lint(missingDescription, {rules}).messages[0].message, 'Add <AlertDialogDescription> directly inside <AlertDialogHeader>, after <AlertDialogTitle>. Preserve existing content and bindings.');

        const nested = output.replace('<template>\n', '<template>\n<main>\n').replace('\n</template>', '\n</main>\n</template>');
        assert.deepEqual(lint(nested, {rules}).messages.map((message) => message.messageId), ['topLevel']);
        const followedByDialog = output.replace('\n</template>', '\n<Dialog />\n</template>');
        assert.deepEqual(lint(followedByDialog, {rules}).messages.map((message) => message.messageId), ['lastInTemplate']);

        for (const trigger of [
            '<AlertDialogTrigger as-child><Button>Open</Button></AlertDialogTrigger>',
            '<AlertDialogTrigger>Open</AlertDialogTrigger>',
        ]) {
            const banned = output.replace('    <AlertDialogContent>', `    ${trigger}\n    <AlertDialogContent>`);
            const result = lint(banned, {rules, fix: true});
            assert.equal(result.output, banned, 'the agent must preserve opener behavior when replacing the trigger');
            assert.equal(result.fixed, false);
            assert.deepEqual(result.messages.map((message) => message.messageId), ['forbidden']);
            assert.match(result.messages[0].message, /Control <AlertDialog> with :open and @update:open/);
        }
    }
});

test('AlertDialogTrigger is forbidden outside the dialog too, with any as-child value or spelling', () => {
    for (const name of ['AlertDialogTrigger', 'alert-dialog-trigger']) {
        for (const attribute of ['', ' as-child', ' :as-child="false"']) {
            const markup = template(`<section><${name}${attribute}><button type="button">Open</button></${name}></section>`);
            const result = lint(markup, {rules: alertDialogRules, fix: true});
            assert.equal(result.output, markup);
            assert.deepEqual(result.messages.map((message) => message.ruleId), ['escore/alertdialog-must-follow-structure']);
            assert.equal(result.messages[0].messageId, 'forbidden');
            assert.equal(result.messages[0].message, `Do not use <${name}>. Control <AlertDialog> with :open and @update:open; keep the opener outside the dialog and preserve its behavior.`);
        }
    }
});

test('forbidden declarations are reusable template-wide bans and are never suggested as allowed children', () => {
    const rules = createComponentRules([entry('Panel', [
        entry('LegacyTrigger', undefined, ['forbidden']),
        entry('PanelBody'),
    ])]);
    assert.deepEqual(lint(template('<Panel><PanelBody /></Panel>'), {rules}).messages, []);
    const markup = template('<LegacyTrigger /><Panel><LegacyTrigger /><LegacyTrigger /><PanelBody /></Panel>');
    const result = lint(markup, {rules, fix: true});
    assert.equal(result.output, markup);
    assert.deepEqual(result.messages.map((message) => message.messageId), ['forbidden', 'forbidden', 'forbidden']);
    assert.match(result.messages[0].message, /Do not use <LegacyTrigger>; it is forbidden/);
    const unexpected = lint(template('<Panel><Unknown /></Panel>'), {rules}).messages;
    assert.deepEqual(unexpected.map((message) => message.messageId), ['missing', 'unexpected']);
    assert.ok(unexpected.every((message) => !message.message.includes('LegacyTrigger')));
});

test('AlertDialog descendants need their declared parents even without the dialog root', () => {
    const markup = template(`<section>
    <AlertDialogHeader>
        <AlertDialogTitle>Delete project?</AlertDialogTitle>
        <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogAction>Delete</AlertDialogAction>
</section>`);
    const result = lint(markup, {rules: {...alertRules, ...alertDialogRules}, fix: true});
    assert.equal(result.output, markup);
    assert.deepEqual(result.messages.map((message) => message.ruleId), [
        'escore/alertdialog-must-follow-structure', 'escore/alertdialog-must-follow-structure',
    ]);
    assert.match(result.messages[0].message, /Move <AlertDialogHeader> directly inside <AlertDialogContent>/);
    assert.match(result.messages[1].message, /Move <AlertDialogAction> directly inside <AlertDialogFooter>/);
});

test('AlertDialog root and action props are checked against their Vue source', () => {
    const markup = template('<AlertDialog open="sometimes"><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete?</AlertDialogTitle><AlertDialogDescription>Confirm.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="sometimes">Delete</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>');
    const result = lint(markup, {rules: alertDialogRules, only: ['alertdialog-must-have-valid-props']});
    assert.deepEqual(result.messages.map((message) => message.messageId), ['propValue', 'propValue']);
    assert.match(result.messages[0].message, /Set open on <AlertDialog> to boolean; received "sometimes"/);
    assert.match(result.messages[1].message, /Set variant on <AlertDialogAction> to .*"destructive".*received "sometimes"/);
});

test('Comment and BlankLine cannot be repeatable', () => {
    assert.throws(() => createComponentRules([
        entry('Comment', undefined, ['required', 'repeatable']), entry('Panel'),
    ]), /Comment cannot.*be repeatable/);
    assert.throws(() => createComponentRules([entry('Panel', [
        entry('Header'), entry('BlankLine', undefined, ['required', 'repeatable']), entry('Footer'),
    ])]), /BlankLine cannot.*be repeatable/);
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
    const result = lint(nested, {only: ['empty-must-follow-structure']});
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].message, 'Add <EmptyHeader> directly inside <Empty>. Preserve existing content and bindings.');
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

test('Avatar uses image alt before fallback text and fixes both children to one line', () => {
    const sourceCode = template(`<Avatar>
    <AvatarImage
        src="/ava.jpg"
        alt="Portrait of Ava Martin"
    />
    <AvatarFallback>
        AM
    </AvatarFallback>
</Avatar>`);
    const output = fixed(sourceCode, {rules: avatarRules});
    assert.equal(output, template(`<!-- Portrait of Ava Martin -->
<Avatar>
    <AvatarImage src="/ava.jpg" alt="Portrait of Ava Martin" />
    <AvatarFallback>AM</AvatarFallback>
</Avatar>`));

    const missingImage = lint(template('<Avatar><AvatarFallback>AM</AvatarFallback></Avatar>'), {rules: avatarRules, fix: true});
    assert.match(missingImage.output, /<!-- AM -->/);
    assert.deepEqual(missingImage.messages.map((message) => message.messageId), ['missing']);
    assert.match(missingImage.messages[0].message, /Add <AvatarImage> directly inside <Avatar>/);
});

test('attribute comment sources fall back when text is absent, dynamic, or possibly overridden', () => {
    const options = {rules: avatarRules, only: ['avatar-must-have-valid-comments']};
    for (const attributes of [
        '', 'alt', 'alt=""', 'alt="   "', ':alt="name"', ':alt="false"', ':alt="0"',
        ':alt="getName()"', ':alt="`Portrait of ${name}`"', ':alt',
        'alt="Wrong" v-bind="imageProps"', 'alt="Wrong" :[attribute]="value"',
        'alt="Wrong" :alt="name"', 'alt="Wrong" v-model:alt="name"',
        'alt="Wrong" v-if="visible"',
    ]) {
        const markup = template(`<Avatar><AvatarImage ${attributes} /><AvatarFallback>AM</AvatarFallback></Avatar>`);
        assert.match(fixed(markup, options), /<!-- AM -->/, attributes);
    }

    const dynamic = template('<Avatar><AvatarImage :alt="name" /><AvatarFallback>{{ initials }}</AvatarFallback></Avatar>');
    const result = lint(dynamic, {...options, fix: true});
    assert.equal(result.output, dynamic);
    assert.deepEqual(result.messages.map((message) => message.messageId), ['commentManual']);
    assert.deepEqual(lint(dynamic.replace('<Avatar>', '<!-- User avatar -->\n<Avatar>'), options).messages, []);
});

test('named attribute sources work for any family and use safely extractable string bindings', () => {
    const rules = createComponentRules([comment(), entry('Panel', undefined, ['required', 'comment-source:data-label', 'comment-source'])]);
    for (const attributes of [
        'data-label="First"', 'dataLabel="First"', ':data-label="\'First\'"',
        ':data-label="`First`"', ':[\'data-label\']="\'First\'"',
        'v-bind="attrs" data-label="First"', ':[attribute]="value" data-label="First"',
        'data-label="First" :other="value"',
    ]) {
        assert.match(fixed(template(`<Panel ${attributes}>Fallback</Panel>`), {rules}), /<!-- First -->/, attributes);
    }
    assert.match(fixed(template('<Panel data-label=" ">Fallback</Panel>'), {rules}), /<!-- Fallback -->/);
});

test('attribute comment fixes normalize and escape text without replacing existing comments', () => {
    const rules = createComponentRules([comment(), entry('Panel', undefined, ['required', 'comment-source:label'])]);
    const markup = template('<Panel label="  A &amp; B --&gt; &lt;C&gt;  " />').replaceAll('\n', '\r\n');
    const output = fixed(markup, {rules});
    assert.ok(output.includes('<!-- A & B &#45;&#45;&gt; &lt;C&gt; -->\r\n<Panel'));
    assert.equal(output.replaceAll('\r\n', '').includes('\n'), false);
    const authored = markup.replace('<Panel', '<!-- Custom -->\r\n<Panel');
    const result = lint(authored, {rules, fix: true});
    assert.equal(result.output, authored);
    assert.deepEqual(result.messages.map((message) => message.messageId), ['commentMismatch']);
});

test('missing source entries fall through without hiding structural violations', () => {
    const sourceCode = empty('', '<EmptyHeader><EmptyDescription>Fallback</EmptyDescription></EmptyHeader>').replace('<!-- No results -->\n', '');
    const result = lint(sourceCode, {fix: true});
    assert.match(result.output, /<!-- Fallback -->/);
    assert.deepEqual(result.messages.map((message) => message.messageId), ['missing']);
    assert.equal(result.messages[0].message, 'Add <EmptyTitle> directly inside <EmptyHeader>, before <EmptyDescription>. Preserve existing content and bindings.');
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

test('attribute and text sources feed the nearest declared comment above them', () => {
    const rules = createComponentRules([comment(), entry('Panel', [
        entry('List', [comment(), entry('Item', [source('Link')])], ['required', 'comment-source:data-label']),
    ])]);
    const markup = template('<Panel>\n<List data-label="Workspace navigation">\n<Item><Link>Workspace</Link></Item>\n</List>\n</Panel>');
    const output = fixed(markup, {rules});
    assert.ok(output.includes('<!-- Workspace navigation -->\n<Panel>'));
    assert.ok(output.includes('<!-- Workspace -->\n<Item>'));
    assert.equal((output.match(/<!--/g) ?? []).length, 2);
});

test('parent source fallback skips nested comment scopes, including absent optional comments', () => {
    for (const presence of ['required', 'optional']) {
        const rules = createComponentRules([comment(), entry('Panel', [
            source('Heading'),
            entry('Comment', undefined, [presence]),
            entry('Section', [source('Label')], ['required', 'comment-source:data-label']),
            source('Footer'),
        ])]);
        const markup = template('<Panel>\n<Heading>{{ heading }}</Heading>\n<Section data-label=""><Label>Child text</Label></Section>\n<Footer>Parent fallback</Footer>\n</Panel>');
        const output = fixed(markup, {rules});
        assert.ok(output.includes('<!-- Parent fallback -->\n<Panel>'));
        assert.equal(output.includes('<!-- Child text -->\n<Section'), presence === 'required');
        const authored = markup.replace('<Section', '<!-- Child text -->\n<Section');
        assert.ok(fixed(authored, {rules}).includes('<!-- Parent fallback -->\n<Panel>'));
    }
});

test('a scope without usable sources cannot borrow from its parent or child', () => {
    const rules = createComponentRules([comment(), entry('Panel', [
        source('Heading', ['optional']), comment(), entry('Section', [source('Label')]),
    ])]);
    const missingParent = lint(template('<Panel>\n<Section><Label>Child text</Label></Section>\n</Panel>'), {rules, fix: true});
    assert.ok(missingParent.output.includes('<!-- Child text -->\n<Section>'));
    assert.deepEqual(missingParent.messages.map((message) => message.messageId), ['commentManual']);
    assert.match(missingParent.messages[0].message, /above <Panel>/);
    const missingChild = lint(template('<Panel>\n<Heading>Parent text</Heading>\n<Section><Label>{{ label }}</Label></Section>\n</Panel>'), {rules, fix: true});
    assert.ok(missingChild.output.includes('<!-- Parent text -->\n<Panel>'));
    assert.deepEqual(missingChild.messages.map((message) => message.messageId), ['commentManual']);
    assert.match(missingChild.messages[0].message, /above <Section>/);
});

test('native text extraction cannot cross a nested comment boundary', () => {
    const rules = createComponentRules([comment(), entry('Panel', [
        entry('div', [comment(), source('span')], ['required', 'comment-source']),
    ])]);
    const result = lint(template('<Panel>\n<div>\n<span>Child text</span>\n</div>\n</Panel>'), {rules, fix: true});
    assert.ok(result.output.includes('<!-- Child text -->\n<span>'));
    assert.deepEqual(result.messages.map((message) => message.messageId), ['commentManual']);
    assert.match(result.messages[0].message, /above <Panel>/);
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

test('fixed comment text overrides sources and fixes missing, empty, or different comments', () => {
    const rules = createComponentRules([entry('Comment', undefined, ['required', 'text:Separator']), source('Panel')]);
    for (const content of ['Different source', '{{ dynamicSource }}', '']) {
        const expected = template(`<!-- Separator -->\n<Panel>${content}</Panel>`);
        for (const prefix of ['', '<!-- -->\n', '<!-- Something else -->\n', '<!-- Separator -->\n']) {
            assert.equal(fixed(template(`${prefix}<Panel>${content}</Panel>`), {rules}), expected);
        }
    }
    const result = lint(template('<!-- Different -->\n<Panel />'), {rules});
    assert.deepEqual(result.messages.map((message) => message.messageId), ['commentFixed']);
    assert.equal(result.messages[0].message, 'Replace the comment above <Panel> with <!-- Separator -->.');
});

test('fixed comments keep their descendant sources inside their own scope', () => {
    const rules = createComponentRules([comment(), entry('Panel', [
        entry('Comment', undefined, ['required', 'text:Section']),
        entry('Section', [source('Label')]),
    ])]);
    const result = lint(template('<Panel>\n<Section><Label>Child text</Label></Section>\n</Panel>'), {rules, fix: true});
    assert.ok(result.output.includes('<!-- Section -->\n<Section>'));
    assert.deepEqual(result.messages.map((message) => message.messageId), ['commentManual']);
    assert.match(result.messages[0].message, /above <Panel>/);
});

test('optional fixed comments remain optional and preserve escaped content and CRLF', () => {
    const rules = createComponentRules([entry('Comment', undefined, ['optional', 'text:Status: A --> <B>']), entry('Panel')]);
    const markup = template('<Panel />').replaceAll('\n', '\r\n');
    assert.equal(fixed(markup, {rules}), markup);
    const output = fixed(markup.replace('<Panel', '<!-- Different -->\r\n<Panel'), {rules});
    assert.ok(output.includes('<!-- Status: A &#45;&#45;&gt; &lt;B&gt; -->\r\n<Panel'));
    assert.equal(output.replaceAll('\r\n', '').includes('\n'), false);
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
        [{Panel: {flags: ['required', 'comment-source:']}}],
        [{Panel: {flags: ['required', 'comment-source:alt text']}}],
        [{Panel: {flags: ['required', 'comment-source::alt']}}],
        [{Panel: {flags: ['required', 'comment-source:alt', 'comment-source:alt']}}],
        [entry('Comment', undefined, ['required', 'text:']), entry('Panel')],
        [entry('Comment', undefined, ['required', 'text:   ']), entry('Panel')],
        [entry('Comment', undefined, ['required', 'text:First\nSecond']), entry('Panel')],
        [entry('Comment', undefined, ['required', 'text:First', 'text:Second']), entry('Panel')],
        [entry('Panel', undefined, ['required', 'text:Separator'])],
        [entry('Panel', [entry('Header'), entry('BlankLine', undefined, ['required', 'text:Separator']), entry('Footer')])],
        [{Panel: {flags: ['required'], typo: []}}],
        [{Panel: {flags: ['required'], children: {}}}],
        [{Panel: {}, Other: {}}],
        [entry('Panel', [blank(), entry('Header')])],
        [entry('Panel', [entry('Header'), blank()])],
        [entry('Panel', [comment()])],
        [entry('Panel', [source('Comment'), entry('Header')])],
        [entry('Comment', undefined, ['required', 'comment-source:alt']), entry('Panel')],
        [entry('Panel', [entry('Header'), entry('BlankLine', undefined, ['required', 'comment-source:alt']), entry('Footer')])],
        [entry('Panel', undefined, ['forbidden'])],
        [entry('Panel', [entry('PanelTrigger', undefined, ['required', 'forbidden'])])],
        [entry('Panel', [entry('PanelTrigger', undefined, ['optional', 'forbidden'])])],
        [entry('Panel', [entry('PanelTrigger', undefined, ['forbidden', 'one-liner'])])],
        [entry('Panel', [entry('PanelTrigger', undefined, ['forbidden', 'repeatable'])])],
        [entry('Panel', [entry('PanelTrigger', [], ['forbidden'])])],
        [entry('Panel', [entry('Comment', undefined, ['forbidden'])])],
        [entry('Panel', [entry('BlankLine', undefined, ['forbidden'])])],
        [entry('Panel', [comment(), entry('PanelTrigger', undefined, ['forbidden'])])],
        [entry('Panel', [entry('PanelTrigger', undefined, ['forbidden']), blank(), entry('PanelBody')])],
        [entry('Panel', [entry('PanelTrigger', undefined, ['forbidden']), entry('PanelBody', [entry('PanelTrigger')])])],
        [entry('Comment', undefined, ['required', 'top-level']), entry('Panel')],
        [entry('Panel', [entry('Header'), entry('BlankLine', undefined, ['required', 'last-in-template']), entry('Footer')])],
        [entry('Panel', [entry('PanelHeader', undefined, ['required', 'top-level'])])],
        [entry('Panel', [entry('PanelHeader', undefined, ['required', 'last-in-template'])])],
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
        const componentScope = ['empty', 'accordion', 'alert', 'alertdialog', 'aspectratio', 'attachment', 'attachmentgroup', 'avatar', 'badge', 'breadcrumb', 'bubble', 'bubblegroup', 'button', 'buttongroup', 'calendar', 'caption', 'card', 'checkbox'].every((family) => config.some((item) => item.files?.includes('**/*.vue') && item.rules?.['escore/' + family + '-must-follow-structure'] === 'error'));
        console.log(JSON.stringify({registered: [...registered].sort(), enabled: [...enabled].sort(), generalScope, componentScope}));
    `], {cwd: projectDirectory, encoding: 'utf8'});
    const result = JSON.parse(output);
    const expected = [...Object.keys(emptyRules), ...Object.keys(accordionRules), ...Object.keys(alertRules), ...Object.keys(alertDialogRules), ...Object.keys(aspectRatioRules), ...Object.keys(attachmentRules), ...Object.keys(avatarRules), ...Object.keys(badgeRules), ...Object.keys(breadcrumbRules), ...Object.keys(bubbleRules), ...Object.keys(buttonRules), ...Object.keys(buttonGroupRules), ...Object.keys(calendarRules), ...Object.keys(captionRules), ...Object.keys(cardRules), ...Object.keys(checkboxRules), 'comment-must-have-blank-line-above', 'all-must-not-have-aria-attributes', 'all-must-not-have-title-attribute'].sort();
    assert.deepEqual(result.registered, expected);
    assert.deepEqual(result.enabled, expected.map((name) => `escore/${name}`));
    assert.equal(result.generalScope, true);
    assert.equal(result.componentScope, true);
});
