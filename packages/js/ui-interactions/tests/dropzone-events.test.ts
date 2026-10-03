import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture, directoryEntry, entryItem, file, fileEntry, fileList, settle, transfer} from './helpers/dropzone.ts';

test('dropzone nested file drags highlight once until the last leave', function (t) {
    const f = createFixture(t);
    const dataTransfer = transfer();
    assert.equal(f.element.emit('dragenter', {dataTransfer}).defaultPrevented, true);
    f.element.emit('dragenter', {dataTransfer});
    f.element.emit('dragleave');
    assert.equal(f.engine.getState().draggingOver, true);
    assert.equal(f.events.length, 1);
    f.element.emit('dragleave');
    f.element.emit('dragleave');
    assert.equal(f.engine.getState().draggingOver, false);
    assert.deepEqual(f.events.map(state => state.draggingOver), [true, false]);
});

test('dropzone dragover accepts copy and recovers a missed dragenter without duplicate delivery', function (t) {
    const f = createFixture(t);
    const dataTransfer = transfer();
    assert.equal(f.element.emit('dragover', {dataTransfer}).defaultPrevented, true);
    assert.equal(dataTransfer.dropEffect, 'copy');
    f.element.emit('dragover', {dataTransfer});
    assert.equal(f.events.length, 1);
    f.engine.setDisabled(true);
    f.engine.setDisabled(false);
    f.element.emit('dragover', {dataTransfer});
    assert.equal(f.engine.getState().draggingOver, true);
});

test('dropzone leaves text/link and absent-transfer events untouched', function (t) {
    const f = createFixture(t);
    for (const dataTransfer of [null, transfer([], {types: ['text/plain', 'text/uri-list']})]) {
        for (const target of [f.element, f.document]) {
            for (const type of ['dragenter', 'dragover', 'drop']) {
                assert.equal(target.emit(type, {dataTransfer}).defaultPrevented, false);
            }
        }
    }
    assert.equal(f.events.length, 0);
    assert.equal(f.engine.getState().count, 0);
});

test('dropzone disable clears nested drag depth and blocks local acquisition UI', function (t) {
    const f = createFixture(t);
    f.element.emit('dragenter', {dataTransfer: transfer()});
    f.element.emit('dragenter', {dataTransfer: transfer()});
    f.engine.setDisabled(true);
    assert.deepEqual(f.events.map(state => [state.disabled, state.draggingOver]), [[false, true], [true, false]]);
    for (const type of ['dragenter', 'dragover', 'drop']) {
        assert.equal(f.element.emit(type, {dataTransfer: transfer([file()])}).defaultPrevented, false);
    }
    f.element.emit('click');
    f.engine.openFilePicker();
    assert.equal(f.picker.clicks, 0);
    assert.equal(f.engine.getState().count, 0);
    f.engine.setDisabled(false);
    f.element.emit('dragenter', {dataTransfer: transfer()});
    f.element.emit('dragleave');
    assert.equal(f.engine.getState().draggingOver, false);
});

for (const reset of ['document drop', 'window blur']) {
    test(`dropzone ${reset} resets a nested drag`, function (t) {
        const f = createFixture(t);
        f.element.emit('dragenter', {dataTransfer: transfer()});
        f.element.emit('dragenter', {dataTransfer: transfer()});
        if (reset === 'document drop') f.document.emit('drop', {dataTransfer: transfer()});
        else f.window.emit('blur');
        assert.equal(f.engine.getState().draggingOver, false);
        f.element.emit('dragenter', {dataTransfer: transfer()});
        f.element.emit('dragleave');
        assert.equal(f.engine.getState().draggingOver, false);
        assert.deepEqual(f.events.map(state => state.draggingOver), [true, false, true, false]);
    });
}

test('dropzone page guards prevent unhandled file navigation and respect handled events', function (t) {
    const f = createFixture(t, {disabled: true});
    const dataTransfer = transfer();
    assert.equal(f.document.emit('dragover', {dataTransfer}).defaultPrevented, true);
    assert.equal(dataTransfer.dropEffect, 'none');
    assert.equal(f.document.emit('drop', {dataTransfer}).defaultPrevented, true);
    const handled = transfer([], {dropEffect: 'copy'});
    f.document.emit('dragover', {dataTransfer: handled, defaultPrevented: true});
    f.document.emit('drop', {dataTransfer: handled, defaultPrevented: true});
    assert.equal(handled.dropEffect, 'copy');
    assert.equal(f.events.length, 0);
});

test('dropzone flat drops clear highlight then synchronously publish accepted files', function (t) {
    const f = createFixture(t);
    const value = file();
    f.element.emit('dragenter', {dataTransfer: transfer()});
    const event = f.element.emit('drop', {dataTransfer: transfer([value], {items: undefined})});
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(f.events.map(state => [state.draggingOver, state.count]), [[true, 0], [false, 0], [false, 1]]);
    assert.equal(f.engine.getState().files[0], value);
    f.element.emit('dragleave');
    assert.equal(f.events.length, 3);
});

test('dropzone click config affects automatic opening, with direct picker opening still available', function (t) {
    const f = createFixture(t, {openOnClick: false});
    f.element.emit('click');
    assert.equal(f.picker.clicks, 0);
    f.engine.openFilePicker();
    assert.equal(f.picker.clicks, 1);
    const automatic = createFixture(t);
    automatic.element.emit('click');
    assert.equal(automatic.picker.clicks, 1);
});

test('dropzone picker changes use normal validation and reset input even for repeated or empty picks', function (t) {
    const f = createFixture(t);
    const value = file();
    f.picker.files = fileList([value]);
    f.picker.value = 'chosen';
    f.picker.emit('change');
    assert.equal(f.picker.value, '');
    assert.deepEqual(f.engine.getState().files, [value]);
    f.picker.value = 'chosen again';
    f.picker.emit('change');
    assert.equal(f.errors[0].id, 'duplicate');
    assert.equal(f.picker.value, '');
    f.picker.files = null;
    f.picker.emit('change');
    assert.equal(f.events.length, 1);
});

test('dropzone recursively extracts every directory batch in order and prefers items over flat files', async function (t) {
    const f = createFixture(t);
    const files = [file('one'), file('nested'), file('later'), file('last')];
    const nested = directoryEntry([[fileEntry(files[1])], []]);
    const root = directoryEntry([[fileEntry(files[0]), nested], [fileEntry(files[2])], []]);
    const dataTransfer = transfer([file('flat ignored')], {items: [entryItem(root), entryItem(fileEntry(files[3]))]});
    f.element.emit('drop', {dataTransfer});
    assert.equal(f.events.length, 0);
    await settle();
    assert.deepEqual(f.engine.getState().files, files);
    assert.equal(f.events.length, 1);
});

test('dropzone item fallback handles absent/null entry APIs, ignores strings and null files', async function (t) {
    const f = createFixture(t);
    const files = [file('plain'), file('null entry')];
    f.element.emit('drop', {dataTransfer: transfer([], {items: [
        {kind: 'file', getAsFile: () => files[0]},
        {kind: 'file', webkitGetAsEntry: () => null, getAsFile: () => files[1]},
        {kind: 'string', getAsFile() { assert.fail('string items are ignored'); }},
        {kind: 'file', getAsFile: () => null},
    ]})});
    await settle();
    assert.deepEqual(f.engine.getState().files, files);
});

test('dropzone unreadable entries are skipped and later directory failures preserve earlier batches', async function (t) {
    const f = createFixture(t);
    const kept = file('kept');
    const directory = directoryEntry([[fileEntry(file('lost'), true), fileEntry(kept)], new Error('cannot read next batch')]);
    f.element.emit('drop', {dataTransfer: transfer([], {items: [entryItem(directory), entryItem(directoryEntry([new Error('unreadable directory')]))]})});
    await settle();
    assert.deepEqual(f.engine.getState().files, [kept]);
    assert.deepEqual(f.errors, []);
});

test('dropzone collection failures report an error without acquiring the flat fallback', async function (t) {
    const f = createFixture(t);
    for (const [cause, message] of [[new Error('entry access denied'), 'entry access denied'], ['failure', 'Unable to collect the dropped files.']]) {
        f.element.emit('drop', {dataTransfer: transfer([file()], {items: [{webkitGetAsEntry() { throw cause; }}]})});
        await settle();
        assert.deepEqual(f.errors.at(-1), {id: 'collect-failed', message, metadata: {files: []}});
    }
    assert.equal(f.engine.getState().count, 0);
    assert.equal(f.events.length, 0);
});
