import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDropzone} from 'strata-packages/ui-interactions/dropzone';
import {createFixture, createHost} from './helpers/dropzone.ts';

test('dropzone requires an element with DOM event capabilities', function () {
    for (const element of [undefined, null, false, {}, {addEventListener: 1}]) {
        assert.throws(() => createDropzone(element), /element.*DOM element/);
    }
});

for (const name of ['onChange', 'onError']) {
    test(`dropzone validates ${name} before attaching listeners`, function () {
        for (const value of [null, false, 1, '', [], {}]) {
            const host = createHost();
            assert.throws(() => createDropzone(host.element, {[name]: value}), new RegExp(`${name}.*function`));
            assert.equal(host.element.registrations.length, 0);
            assert.equal(host.created.length, 0);
        }
    });
}

for (const name of ['accept', 'exclude']) {
    test(`dropzone validates the existing dotted ${name} extension list`, function () {
        for (const value of [null, '.png', [], [null], [''], [' '], [' .png'], ['.png '], ['png']]) {
            const host = createHost();
            assert.throws(() => createDropzone(host.element, {[name]: value}), error => error instanceof TypeError && error.message.includes(name));
            assert.equal(host.element.registrations.length, 0);
        }
    });
}

for (const name of ['minSize', 'maxSize', 'maxTotalSize', 'maxFiles']) {
    test(`dropzone requires a positive finite ${name}`, function () {
        for (const value of [null, false, 0, -1, NaN, Infinity, -Infinity, '2', {}]) {
            assert.throws(() => createDropzone(createHost().element, {[name]: value}), new RegExp(name));
        }
    });
}

test('dropzone validates count integrality and compatible size limits', function (t) {
    assert.throws(() => createDropzone(createHost().element, {maxFiles: 1.5}), /maxFiles.*whole number/);
    assert.throws(() => createDropzone(createHost().element, {minSize: 3, maxSize: 2}), /minSize.*maxSize/);
    createFixture(t, {minSize: 1.5, maxSize: 1.5, maxTotalSize: 1.5, maxFiles: 1});
});

for (const name of ['multiple', 'openOnClick', 'disabled', 'dedupe', 'videoPreview', 'generateImageThumbnail', 'generateVideoThumbnail']) {
    test(`dropzone requires boolean ${name}`, function (t) {
        for (const value of [null, 0, 1, 'true', [], {}]) {
            assert.throws(() => createDropzone(createHost().element, {[name]: value}), new RegExp(`${name}.*boolean`));
        }
        createFixture(t, {[name]: false});
        createFixture(t, {[name]: true});
    });
}

test('dropzone defaults are empty, enabled, and silent; picker belongs to the element document', function (t) {
    const f = createFixture(t);
    assert.deepEqual(f.engine.getState(), {files: [], count: 0, totalSize: 0, draggingOver: false, disabled: false});
    assert.deepEqual(f.events, []);
    assert.deepEqual(f.created, ['input']);
    assert.equal(f.picker.type, 'file');
    assert.equal(f.picker.multiple, true);
    assert.equal(f.picker.accept, '');
    f.engine.openFilePicker();
    assert.equal(f.picker.clicks, 1);
});

test('dropzone passes explicit picker configuration and initial disabled state', function (t) {
    const f = createFixture(t, {accept: ['.PNG', '.tar.gz'], exclude: ['.bad'], multiple: false, disabled: true});
    assert.equal(f.picker.accept, '.PNG,.tar.gz');
    assert.equal(f.picker.multiple, false);
    assert.equal(f.engine.getState().disabled, true);
    assert.deepEqual(f.events, []);
    f.engine.openFilePicker();
    assert.equal(f.picker.clicks, 0);
});

test('dropzone rejects invalid subscribers and supports absent optional callbacks', function (t) {
    const host = createHost();
    const engine = createDropzone(host.element, {onChange: undefined, onError: undefined});
    t.after(() => engine.destroy());
    for (const listener of [null, undefined, 1, false, {}]) assert.throws(() => engine.subscribe(listener), /listener.*function/);
    engine.setDisabled(true);
    assert.equal(engine.getState().disabled, true);
});
