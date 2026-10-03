import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDropzone} from 'strata-packages/ui-interactions/dropzone';
import {createFixture, createHost, file, transfer} from './helpers/dropzone.ts';

test('dropzone construction, subscriptions and state reads remain silent until a synchronous change', function (t) {
    const f = createFixture(t);
    const received = [];
    f.engine.subscribe(state => received.push(state));
    f.engine.getState();
    assert.deepEqual(f.events, []);
    assert.deepEqual(received, []);
    const value = file();
    f.engine.addFiles(value);
    assert.equal(received.length, 1);
    assert.equal(received[0].files[0], value);
    assert.deepEqual(received[0], f.engine.getState());
});

test('dropzone first and subsequent no-op setters, empty inputs and idle events are silent', function (t) {
    const f = createFixture(t);
    function noops() {
        f.engine.setDisabled(false);
        f.engine.clearFiles();
        f.engine.addFiles([]);
        f.engine.removeFile(file('absent'));
        f.engine.replaceFile(file('absent'), file('replacement'));
        f.element.emit('dragleave');
        f.window.emit('blur');
        f.document.emit('drop');
    }
    noops();
    assert.equal(f.events.length, 0);
    f.engine.setDisabled(true);
    f.engine.setDisabled(true);
    f.engine.setDisabled(false);
    noops();
    assert.equal(f.events.length, 2);
});

test('dropzone distinct equal-name/equal-size File replacement notifies; same File replacement is silent', function (t) {
    const f = createFixture(t);
    const first = file();
    const replacement = file();
    f.engine.addFiles(first);
    assert.equal(f.engine.replaceFile(first, first), true);
    assert.equal(f.events.length, 1);
    assert.equal(f.engine.replaceFile(first, replacement), true);
    assert.equal(f.events.length, 2);
    assert.equal(f.events[1].files[0], replacement);
    assert.equal(f.events[0].files[0], first);
});

test('dropzone successful mutations and notifications never serialize state or Files', function (t) {
    const stringify = t.mock.method(JSON, 'stringify', () => assert.fail('state must not be serialized'));
    const f = createFixture(t);
    const first = file();
    first.toJSON = () => assert.fail('Files are opaque');
    const next = file();
    f.engine.addFiles(first);
    f.engine.replaceFile(first, next);
    f.element.emit('dragenter', {dataTransfer: transfer()});
    f.engine.setDisabled(true);
    f.engine.setDisabled(true);
    f.engine.setDisabled(false);
    f.engine.removeFile(next);
    f.engine.addFiles(first);
    f.engine.clearFiles();
    assert.equal(stringify.mock.callCount(), 0);
    stringify.mock.restore();
    assert.equal(f.errors.length, 0);
    assert.equal(f.events.length, 8);
});

test('dropzone each subscriber and state read owns its snapshot and files array', function (t) {
    const value = file();
    const f = createFixture(t, {onChange(state) { state.files.length = 0; state.count = 99; }});
    const received = [];
    f.engine.subscribe(state => { state.files.push(file('corrupt')); state.totalSize = 999; });
    f.engine.subscribe(state => received.push(state));
    f.engine.addFiles(value);
    const first = f.engine.getState();
    const second = f.engine.getState();
    assert.deepEqual(received[0], first);
    assert.equal(received[0].files[0], value);
    assert.notEqual(first, second);
    assert.notEqual(first.files, second.files);
    assert.notEqual(first.files, received[0].files);
    first.files.length = 0;
    first.disabled = true;
    assert.deepEqual(f.engine.getState(), second);
});

test('dropzone duplicate subscriptions share identity and either handle unsubscribes them', function (t) {
    const host = createHost();
    const received = [];
    const listener = state => received.push(state);
    const engine = createDropzone(host.element, {onChange: listener});
    t.after(() => engine.destroy());
    const first = engine.subscribe(listener);
    const second = engine.subscribe(listener);
    engine.setDisabled(true);
    assert.equal(received.length, 1);
    second();
    first();
    engine.setDisabled(false);
    assert.equal(received.length, 1);
    engine.subscribe(listener);
    engine.setDisabled(true);
    assert.equal(received.length, 2);
    first();
    engine.setDisabled(false);
    assert.equal(received.length, 2);
});

test('dropzone unsubscribing a pending listener during delivery skips it', function (t) {
    const f = createFixture(t);
    const received = [];
    let detach;
    f.engine.subscribe(() => detach());
    detach = f.engine.subscribe(state => received.push(state));
    f.engine.addFiles(file());
    assert.equal(f.events.length, 1);
    assert.deepEqual(received, []);
});

test('dropzone isolates throwing change and error callbacks without starving consumers or errors', function (t) {
    const logged = t.mock.method(console, 'error', () => {});
    const cause = new Error('consumer failed');
    const f = createFixture(t, {onChange() { throw cause; }, onError() { throw cause; }});
    const received = [];
    f.engine.subscribe(() => { throw cause; });
    f.engine.subscribe(state => received.push(state));
    const good = file('good');
    const result = f.engine.addFiles([good, file('empty1', 0), file('empty2', 0)]);
    assert.deepEqual(result.accepted, [good]);
    assert.equal(result.errors.length, 2);
    assert.equal(f.errors.length, 2);
    assert.equal(received.length, 1);
    assert.equal(logged.mock.callCount(), 4);
    assert.equal(logged.mock.calls[0].arguments[1], cause);
});

test('dropzone reentrant changes deliver only the latest snapshot to remaining listeners', function (t) {
    const f = createFixture(t);
    const second = file('second');
    f.engine.subscribe(state => { if (state.count === 1) f.engine.addFiles(second); });
    const received = [];
    f.engine.subscribe(state => received.push(state));
    const first = file('first');
    f.engine.addFiles(first);
    assert.deepEqual(f.events.map(state => state.count), [1, 2]);
    assert.deepEqual(received.map(state => state.files), [[first, second]]);
});

test('dropzone a reentrant no-op keeps the current notification available to remaining listeners', function (t) {
    const f = createFixture(t);
    f.engine.subscribe(() => f.engine.setDisabled(false));
    const received = [];
    f.engine.subscribe(state => received.push(state));
    f.engine.addFiles(file());
    assert.equal(received.length, 1);
    assert.equal(f.events.length, 1);
});

test('dropzone rejection callbacks can mutate the committed collection safely', function (t) {
    let f;
    f = createFixture(t, {onError() { f.engine.clearFiles(); }});
    const good = file();
    const result = f.engine.addFiles([good, file('empty', 0)]);
    assert.deepEqual(result.accepted, [good]);
    assert.deepEqual(f.events.map(state => state.count), [1, 0]);
    assert.equal(f.engine.getState().count, 0);
});
