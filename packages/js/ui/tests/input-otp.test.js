import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';

const require = createRequire(new URL('../../package.json', import.meta.url));
const compiler = require('@vue/compiler-sfc');
const ts = require('typescript');
compiler.registerTS(() => ts);

// Compile the actual components and dependency types without a browser or build server.
const transpile = (source) => ts.transpileModule(source, {
    compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS},
}).outputText;
require.extensions['.vue'] = (module, filename) => {
    const {descriptor} = compiler.parse(readFileSync(filename, 'utf8'), {filename});
    const script = compiler.compileScript(descriptor, {id: filename, inlineTemplate: true, fs: ts.sys});
    module._compile(transpile(script.content), filename);
};
require.extensions['.ts'] = (module, filename) => module._compile(transpile(readFileSync(filename, 'utf8')), filename);

const {createRenderer, defineComponent, h, nextTick, ref} = require('vue');
const InputOTP = require('./ui/src/components/input-otp/InputOTP.vue').default;
const InputOTPGroup = require('./ui/src/components/input-otp/InputOTPGroup.vue').default;
const InputOTPSlot = require('./ui/src/components/input-otp/InputOTPSlot.vue').default;

// Only the input host APIs used by vue-input-otp are needed by this renderer.
globalThis.document = {
    activeElement: null,
    head: {appendChild() {}},
    createElement: () => ({sheet: {insertRule() {}}}),
};
globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
};

function node(tag, text = '') {
    return {
        tag, text, props: {}, children: [], parent: null, value: '', selectionStart: 0, selectionEnd: 0,
        style: {setProperty() {}},
        select() { this.setSelectionRange(0, this.value.length); },
        setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
        focus() { document.activeElement = this; fire(this, 'onFocus'); },
    };
}

const renderer = createRenderer({
    createElement: node,
    createText: (text) => node('#text', text),
    createComment: (text) => node('#comment', text),
    setText: (target, text) => { target.text = text; },
    setElementText: (target, text) => { target.text = text; target.children = []; },
    patchProp: (target, key, previous, value) => {
        target.props[key] = value;
        if (key === 'value') target.value = value;
    },
    insert: (child, parent, anchor) => {
        if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1);
        parent.children.splice(anchor ? parent.children.indexOf(anchor) : parent.children.length, 0, child);
        child.parent = parent;
    },
    remove: (child) => {
        child.parent?.children.splice(child.parent.children.indexOf(child), 1);
        child.parent = null;
    },
    parentNode: (child) => child.parent,
    nextSibling: (child) => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
});

function mount(t, render) {
    const container = node('root');
    const errors = [];
    const app = renderer.createApp(defineComponent({setup: () => render}));
    app.config.errorHandler = (error) => errors.push(error);
    app.config.warnHandler = () => {};
    app.mount(container);
    t.after(() => app.unmount());
    return {container, errors};
}

function findAll(root, predicate) {
    return [root, ...root.children.flatMap((child) => findAll(child, () => true))].filter(predicate);
}
const boxes = (root) => findAll(root, (child) => child.props['data-slot'] === 'input-otp-slot');
const inputs = (root) => findAll(root, (child) => child.tag === 'input');
const text = (root) => root.tag === '#comment' ? '' : `${root.text}${root.children.map(text).join('')}`;
const characters = (root) => boxes(root).map((box) => text(box).trim());
function fire(target, name, extras = {}) {
    const event = {currentTarget: target, preventDefault() {}, ...extras};
    for (const handler of [target.props[name]].flat()) handler?.(event);
}
const group = (indexes, extra = {}) => h(InputOTPGroup, {}, () => indexes.map((index) => h(InputOTPSlot, {index, ...extra})));

test('typing and focus drive six indexed slots across groups and update v-model', async (t) => {
    const code = ref('');
    const completed = [];
    const {container, errors} = mount(t, () => h(InputOTP, {
        maxlength: 6, modelValue: code.value, 'onUpdate:modelValue': (value) => { code.value = value; },
        onComplete: (value) => completed.push(value),
    }, () => [group([0, 1, 2]), h('span', '-'), group([3, 4, 5])]));
    const input = inputs(container)[0];
    input.focus();
    await nextTick();
    assert.equal(boxes(container)[0].props['data-active'], true);
    assert.ok(findAll(boxes(container)[0], (child) => String(child.props.class).includes('animate-caret-blink')).length);

    input.value = '12';
    fire(input, 'onInput');
    input.focus();
    await nextTick();
    assert.equal(code.value, '12');
    assert.deepEqual(characters(container), ['1', '2', '', '', '', '']);
    assert.equal(boxes(container)[2].props['data-active'], true);

    input.value = '123456';
    fire(input, 'onInput');
    await nextTick();
    assert.equal(code.value, '123456');
    assert.deepEqual(characters(container), ['1', '2', '3', '4', '5', '6']);
    assert.deepEqual(completed, ['123456']);

    fire(input, 'onBlur');
    await nextTick();
    assert.ok(boxes(container).every((box) => !box.props['data-active']));
    assert.deepEqual(errors, []);
});

test('parent value and index changes stay reactive and separate roots stay independent', async (t) => {
    const code = ref('12');
    const index = ref(0);
    const {container, errors} = mount(t, () => h('div', [
        h(InputOTP, {maxlength: 2, modelValue: code.value}, () => h('div', [
            group([index.value], {char: '', isActive: false, hasFakeCaret: false}),
        ])),
        h(InputOTP, {maxlength: 2, modelValue: '98'}, () => group([0, 1])),
    ]));
    assert.deepEqual(characters(container), ['1', '9', '8']);
    code.value = '34';
    index.value = 1;
    await nextTick();
    assert.deepEqual(characters(container), ['4', '9', '8']);
    assert.deepEqual(errors, []);
});

test('uncontrolled input supports paste and clearing without manually bound slot state', async (t) => {
    const {container, errors} = mount(t, () => h(InputOTP, {maxlength: 4}, () => group([0, 1, 2, 3])));
    const input = inputs(container)[0];
    input.focus();
    fire(input, 'onPaste', {clipboardData: {getData: () => '9876'}});
    await nextTick();
    assert.deepEqual(characters(container), ['9', '8', '7', '6']);
    input.value = '';
    fire(input, 'onInput');
    await nextTick();
    assert.deepEqual(characters(container), ['', '', '', '']);
    assert.deepEqual(errors, []);
});

test('missing parent and invalid indexes report clear errors', (t) => {
    const orphan = mount(t, () => h(InputOTPSlot, {index: 0}));
    assert.ok(orphan.errors.some((error) => error.message === 'InputOTPSlot must be used inside InputOTP.'));
    for (const index of [undefined, -1, 0.5, 2, NaN, '0']) {
        const {errors} = mount(t, () => h(InputOTP, {maxlength: 2}, () => group([index])));
        assert.ok(errors.some((error) => error instanceof RangeError && error.message.includes('maxlength (2)')), String(index));
    }
});
