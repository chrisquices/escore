import assert from 'node:assert/strict';
import {test} from 'node:test';
import {audioFile, createFixture, createHost, createTarget, deferred, entryItem, file, fileEntry, fileList, mockUrls, settle, transfer} from './helpers/dropzone.ts';

test('dropzone destruction removes each exact acquisition listener once and silently resets dragging', function (t) {
    const f = createFixture(t);
    const value = file();
    f.engine.addFiles(value);
    f.element.emit('dragenter', {dataTransfer: transfer()});
    const count = f.events.length;
    f.engine.destroy();
    f.engine.destroy();
    for (const target of [f.element, f.document, f.window, f.picker]) {
        assert.ok(target.registrations.length);
        assert.deepEqual(target.removals, target.registrations);
        for (const handlers of target.handlers.values()) assert.equal(handlers.size, 0);
    }
    assert.equal(f.events.length, count);
    assert.deepEqual(f.engine.getState(), {files: [value], count: 1, totalSize: value.size, draggingOver: false, disabled: false});
});

test('dropzone public APIs and saved event handlers stay inert after destruction while reads remain available', async function (t) {
    const urls = mockUrls(t);
    const f = createFixture(t, {videoPreview: true});
    const value = file();
    f.engine.addFiles(value);
    const before = f.engine.getState();
    const late = [f.element, f.document, f.window, f.picker].flatMap(target => target.registrations);
    f.engine.destroy();
    const received = [];
    const detach = f.engine.subscribe(state => received.push(state));
    assert.deepEqual(f.engine.addFiles(file('empty', 0)), {accepted: [], errors: []});
    assert.equal(f.engine.removeFile(value), false);
    assert.equal(f.engine.replaceFile(value, file('replacement')), false);
    assert.equal(f.engine.replaceFile(value, null), false);
    f.engine.clearFiles();
    f.engine.setDisabled(true);
    f.engine.openFilePicker();
    assert.equal(await f.engine.createThumbnail(value), null);
    assert.equal(f.engine.createVideoPreview(file('movie.mp4', 8, 'video/mp4')), null);
    assert.deepEqual(f.engine.getFileSize(value), {size: value.size, sizeFormatted: '4.0 B'});
    f.picker.files = fileList([file('late')]);
    f.picker.value = 'late-selection';
    for (const {type, handler} of late) {
        handler({type, dataTransfer: transfer([file('late')]), preventDefault() { assert.fail('late events must stay inert'); }});
    }
    detach();
    detach();
    f.engine.destroy();
    assert.deepEqual(f.engine.getState(), before);
    const state = f.engine.getState();
    state.files.length = 0;
    assert.equal(f.engine.getState().files[0], value);
    assert.equal(f.picker.value, 'late-selection');
    assert.equal(f.picker.clicks, 0);
    assert.equal(f.events.length, 1);
    assert.deepEqual(received, []);
    assert.deepEqual(f.errors, []);
    assert.deepEqual(urls.created, []);
});

test('dropzone destruction during onChange stops pending listeners and rejection callbacks', function (t) {
    const f = createFixture(t, {onChange() { f.engine.destroy(); }});
    const later = [];
    f.engine.subscribe(state => later.push(state));
    const good = file();
    const result = f.engine.addFiles([good, file('empty', 0)]);
    assert.deepEqual(result.accepted, [good]);
    assert.equal(result.errors.length, 1);
    assert.deepEqual(f.engine.getState().files, [good]);
    assert.equal(f.events.length, 1);
    assert.deepEqual(later, []);
    assert.deepEqual(f.errors, []);
});

test('dropzone destruction during onError stops later rejection deliveries', function (t) {
    const f = createFixture(t, {onError() { f.engine.destroy(); }});
    const result = f.engine.addFiles([file('empty1', 0), file('empty2', 0)]);
    assert.equal(result.errors.length, 2);
    assert.equal(f.errors.length, 1);
    assert.equal(f.events.length, 0);
    assert.equal(f.engine.getState().count, 0);
});

test('dropzone rejected replacement is restored before its error callback destroys the engine', function (t) {
    const f = createFixture(t, {onError() { f.engine.destroy(); }});
    const value = file();
    f.engine.addFiles(value);
    assert.equal(f.engine.replaceFile(value, file('empty', 0)), false);
    assert.deepEqual(f.engine.getState().files, [value]);
    assert.equal(f.errors.length, 1);
    assert.equal(f.events.length, 1);
});

test('dropzone destruction while clearing the drop highlight prevents starting file collection', function (t) {
    const f = createFixture(t);
    f.element.emit('dragenter', {dataTransfer: transfer()});
    f.engine.subscribe(state => { if (!state.draggingOver) f.engine.destroy(); });
    const dataTransfer = transfer([file()]);
    Object.defineProperty(dataTransfer, 'items', {get() { assert.fail('collection must not start after destruction'); }});
    const event = f.element.emit('drop', {dataTransfer});
    assert.equal(event.defaultPrevented, true);
    assert.equal(f.engine.getState().count, 0);
    assert.equal(f.engine.getState().draggingOver, false);
    assert.deepEqual(f.errors, []);
});

for (const outcome of ['success', 'read failure']) {
    test(`dropzone late directory ${outcome} cannot add files or notify after destruction`, async function (t) {
        const f = createFixture(t);
        let complete;
        let fail;
        let reads = 0;
        const directory = {isFile: false, createReader() { return {readEntries(success, failure) {
            reads++;
            if (reads === 1) { complete = success; fail = failure; }
            else success([]);
        }}; }};
        f.element.emit('drop', {dataTransfer: transfer([], {items: [entryItem(directory)]})});
        assert.equal(reads, 1);
        f.engine.destroy();
        if (outcome === 'success') complete([fileEntry(file())]);
        else fail(new Error('late read failure'));
        await settle();
        assert.equal(f.engine.getState().count, 0);
        assert.deepEqual(f.events, []);
        assert.deepEqual(f.errors, []);
    });
}

test('dropzone late collection rejection is ignored after destruction', async function (t) {
    const f = createFixture(t);
    f.element.emit('drop', {dataTransfer: transfer([], {items: [{kind: 'file', webkitGetAsEntry() { throw new Error('lookup failed'); }}]})});
    f.engine.destroy();
    await settle();
    assert.deepEqual(f.errors, []);
    assert.deepEqual(f.events, []);
    assert.equal(f.engine.getState().count, 0);
});

test('dropzone destruction cancels every pending video decoder and ignores saved media and canvas callbacks', async function (t) {
    t.mock.timers.enable({apis: ['setTimeout']});
    const urls = mockUrls(t);
    const f = createFixture(t, {videoPreview: true});
    f.canvasOptions.deferBlob = true;
    const first = file('first.mp4', 8, 'video/mp4');
    const second = file('second.mp4', 8, 'video/mp4');
    f.engine.addFiles([first, second]);
    const previews = [f.engine.createVideoPreview(first), f.engine.createVideoPreview(second)];
    const pending = [f.engine.createThumbnail(first), f.engine.createThumbnail(second)];
    f.videos[0].emit('seeked');
    const late = f.videos.flatMap(video => video.registrations);
    f.engine.destroy();
    assert.deepEqual(await Promise.all(pending), [null, null]);
    for (const video of f.videos) {
        assert.equal(video.pauses, 1);
        assert.equal(video.loads, 1);
        assert.deepEqual(video.removed, ['src']);
    }
    for (const {type, handler} of late) handler({type});
    f.canvases[0].callbacks[0](f.canvasOptions.blob);
    t.mock.timers.tick(10000);
    f.engine.destroy();
    await settle();
    assert.equal(urls.created.length, 4);
    assert.deepEqual(new Set(urls.revoked), new Set(urls.created.map(entry => entry.url)));
    assert.equal(urls.revoked.length, 4);
    assert.ok(previews.every(url => urls.revoked.includes(url)));
    assert.equal(f.canvases.length, 1);
    assert.equal(f.events.length, 1);
    assert.deepEqual(f.errors, []);
});

test('dropzone destruction revokes an image URL whose promise has not delivered yet', async function (t) {
    const urls = mockUrls(t);
    const f = createFixture(t);
    const value = file('photo.png', 8, 'image/png');
    f.engine.addFiles(value);
    const pending = f.engine.createThumbnail(value);
    f.engine.destroy();
    assert.equal(await pending, null);
    await settle();
    assert.deepEqual(urls.revoked, [urls.created[0].url]);
    assert.equal(f.events.length, 1);
});

for (const stage of ['header', 'artwork']) {
    test(`dropzone destruction during audio ${stage} reading prevents late URLs and callbacks`, async function (t) {
        const urls = mockUrls(t);
        const f = createFixture(t);
        const value = audioFile();
        const data = deferred();
        const slice = value.slice.bind(value);
        t.mock.method(value, 'slice', (start, end) => ((stage === 'header') === (start === 0)) ? {arrayBuffer: () => data.promise} : slice(start, end));
        f.engine.addFiles(value);
        const pending = f.engine.createThumbnail(value);
        await settle();
        f.engine.destroy();
        data.resolve(await (stage === 'header' ? slice(0, 10) : slice(10)).arrayBuffer());
        assert.equal(await pending, null);
        assert.deepEqual(urls.created, []);
        assert.deepEqual(f.errors, []);
        assert.equal(f.events.length, 1);
    });
}

test('dropzone instances sharing a document keep listeners, state, and resources independent', async function (t) {
    const urls = mockUrls(t);
    const firstHost = createHost();
    const secondHost = createHost();
    // Give each engine its own picker while sharing the document-level guards.
    const createElement = firstHost.document.createElement;
    let inputs = 0;
    firstHost.document.createElement = function (tag) {
        if (tag === 'input' && inputs++ > 0) return secondHost.picker;
        return createElement.call(this, tag);
    };
    secondHost.element = {...createTarget(), ownerDocument: firstHost.document};
    secondHost.document = firstHost.document;
    secondHost.window = firstHost.window;
    const first = createFixture(t, {videoPreview: true}, firstHost);
    const second = createFixture(t, {videoPreview: true}, secondHost);
    const value = file('photo.png', 8, 'image/png');
    const video = file('movie.mp4', 8, 'video/mp4');
    first.engine.addFiles([value, video]);
    second.engine.addFiles([value, video]);
    const firstUrl = await first.engine.createThumbnail(value);
    const secondUrl = await second.engine.createThumbnail(value);
    const firstPreview = first.engine.createVideoPreview(video);
    const secondPreview = second.engine.createVideoPreview(video);
    assert.notEqual(firstUrl, secondUrl);
    assert.notEqual(firstPreview, secondPreview);
    first.engine.destroy();
    await settle();
    assert.deepEqual(new Set(urls.revoked), new Set([firstUrl, firstPreview]));
    second.element.emit('dragenter', {dataTransfer: transfer()});
    assert.equal(second.engine.getState().draggingOver, true);
    firstHost.window.emit('blur');
    assert.equal(second.engine.getState().draggingOver, false);
    assert.equal(second.engine.createVideoPreview(video), secondPreview);
    assert.equal(await second.engine.createThumbnail(value), secondUrl);
    second.engine.removeFile(value);
    assert.deepEqual(first.engine.getState().files, [value, video]);
    second.engine.destroy();
    await settle();
    assert.deepEqual(new Set(urls.revoked), new Set([firstUrl, secondUrl, firstPreview, secondPreview]));
    assert.equal(urls.revoked.length, 4);
    for (const target of [firstHost.document, firstHost.window]) {
        assert.deepEqual(target.removals, target.registrations);
        for (const handlers of target.handlers.values()) assert.equal(handlers.size, 0);
    }
});
