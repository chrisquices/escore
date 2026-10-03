import assert from 'node:assert/strict';
import {test} from 'node:test';
import {artworkFrame, audioFile, createFixture, deferred, file, mockUrls, settle} from './helpers/dropzone.ts';

test('dropzone image thumbnails reuse the File and promise without publishing state', async function (t) {
    const urls = mockUrls(t);
    const f = createFixture(t);
    const value = file('photo.png', 8, 'image/png');
    f.engine.addFiles(value);
    const pending = f.engine.createThumbnail(value);
    assert.equal(f.engine.createThumbnail(value), pending);
    const url = await pending;
    assert.equal(url, urls.created[0].url);
    assert.equal(urls.created[0].blob, value);
    assert.equal(f.engine.createThumbnail(value), pending);
    assert.equal(f.engine.replaceFile(value, value), true);
    assert.equal(await f.engine.createThumbnail(value), url);
    assert.equal(f.events.length, 1);
    assert.deepEqual(urls.revoked, []);
    f.engine.removeFile(value);
    await settle();
    assert.deepEqual(urls.revoked, [url]);
    f.engine.destroy();
    await settle();
    assert.deepEqual(urls.revoked, [url]);
});

test('dropzone automatic thumbnails follow their image and video flags only', async function (t) {
    const urls = mockUrls(t);
    const f = createFixture(t, {generateImageThumbnail: true, generateVideoThumbnail: true});
    const image = file('photo.png', 8, 'image/png');
    const video = file('movie.mp4', 8, 'video/mp4');
    f.engine.addFiles([image, video, audioFile(), file()]);
    assert.equal(urls.created.length, 2);
    assert.deepEqual(urls.created.map(entry => entry.blob), [image, video]);
    assert.equal(f.videos.length, 1);
    f.videos[0].emit('seeked');
    assert.ok(await f.engine.createThumbnail(video));
    assert.ok(await f.engine.createThumbnail(image));
    assert.equal(f.events.length, 1);
    const replacement = file('next.png', 8, 'image/png');
    f.engine.replaceFile(image, replacement);
    assert.equal(urls.created.at(-1).blob, replacement);
    await settle();
    assert.ok(urls.revoked.includes(urls.created[0].url));
});

test('dropzone automatic thumbnails are disabled by default and unsupported types cache null', async function (t) {
    const urls = mockUrls(t);
    const f = createFixture(t);
    const values = [file('photo.png', 8, 'image/png'), file('movie.mp4', 8, 'video/mp4'), file('document.pdf', 8, 'application/pdf')];
    f.engine.addFiles(values);
    assert.deepEqual(urls.created, []);
    const pending = f.engine.createThumbnail(values[2]);
    assert.equal(await pending, null);
    assert.equal(f.engine.createThumbnail(values[2]), pending);
    assert.deepEqual(urls.created, []);
});

test('dropzone direct video previews require the option and a video MIME type', function (t) {
    const urls = mockUrls(t);
    const video = file('movie.mp4', 8, 'video/mp4');
    const disabled = createFixture(t);
    disabled.engine.addFiles(video);
    assert.equal(disabled.engine.createVideoPreview(video), null);
    const f = createFixture(t, {videoPreview: true});
    const image = file('photo.png', 8, 'image/png');
    f.engine.addFiles([video, image]);
    assert.equal(f.engine.createVideoPreview(image), null);
    const url = f.engine.createVideoPreview(video);
    assert.equal(f.engine.createVideoPreview(video), url);
    assert.deepEqual(urls.created, [{url, blob: video}]);
    assert.equal(f.events.length, 1);
    f.engine.clearFiles();
    assert.deepEqual(urls.revoked, [url]);
});

for (const operation of ['remove', 'replace']) {
    test(`dropzone ${operation} keeps both cached previews until the last File reference leaves`, async function (t) {
        const urls = mockUrls(t);
        const f = createFixture(t, {dedupe: false, videoPreview: true});
        const value = file('movie.mp4', 8, 'video/mp4');
        f.engine.addFiles([value, value]);
        const preview = f.engine.createVideoPreview(value);
        const pending = f.engine.createThumbnail(value);
        f.videos[0].emit('seeked');
        const thumbnail = await pending;
        const source = urls.created.find(entry => entry.blob === value && entry.url !== preview).url;
        assert.deepEqual(urls.revoked, [source]);
        assert.equal(f.engine.replaceFile(value, value), true);
        if (operation === 'remove') f.engine.removeFile(value);
        else f.engine.replaceFile(value, file('replacement'));
        assert.equal(f.engine.createVideoPreview(value), preview);
        assert.equal(f.engine.createThumbnail(value), pending);
        assert.deepEqual(urls.revoked, [source]);
        f.engine.removeFile(value);
        await settle();
        assert.deepEqual(new Set(urls.revoked), new Set([source, preview, thumbnail]));
        assert.equal(urls.revoked.length, 3);
    });
}

test('dropzone clear releases all thumbnails and playable previews exactly once', async function (t) {
    const urls = mockUrls(t);
    const f = createFixture(t, {videoPreview: true});
    const image = file('photo.png', 8, 'image/png');
    const video = file('movie.mp4', 8, 'video/mp4');
    f.engine.addFiles([image, video]);
    await f.engine.createThumbnail(image);
    f.engine.createVideoPreview(video);
    f.engine.clearFiles();
    f.engine.clearFiles();
    f.engine.destroy();
    await settle();
    assert.deepEqual(new Set(urls.revoked), new Set(urls.created.map(entry => entry.url)));
    assert.equal(urls.revoked.length, 2);
});

for (const [duration, seek] of [[8, 3], [2, 1], [0, 0.1], [Infinity, 0.1], [NaN, 0.1]]) {
    test(`dropzone video thumbnail seeks duration ${duration} and releases its decoder after success`, async function (t) {
        const urls = mockUrls(t);
        const f = createFixture(t);
        const value = file('movie.mp4', 8, 'video/mp4');
        f.engine.addFiles(value);
        const pending = f.engine.createThumbnail(value);
        const video = f.videos[0];
        assert.equal(video.muted, true);
        assert.equal(video.preload, 'auto');
        assert.equal(video.src, urls.created[0].url);
        video.duration = duration;
        video.emit('loadedmetadata');
        assert.equal(video.currentTime, seek);
        video.emit('seeked');
        const url = await pending;
        const canvas = f.canvases[0];
        assert.equal(canvas.width, video.videoWidth);
        assert.equal(canvas.height, video.videoHeight);
        assert.deepEqual(canvas.draws, [[video, 0, 0, 320, 180]]);
        assert.equal(url, urls.created[1].url);
        assert.equal(urls.created[1].blob, f.canvasOptions.blob);
        assert.equal(video.pauses, 1);
        assert.equal(video.loads, 1);
        assert.deepEqual(video.removed, ['src']);
        assert.deepEqual(urls.revoked, [urls.created[0].url]);
        video.emit('loadedmetadata');
        video.emit('seeked');
        video.emit('error');
        canvas.callbacks[0](f.canvasOptions.blob);
        assert.equal(f.canvases.length, 1);
        assert.equal(urls.created.length, 2);
        assert.equal(video.pauses, 1);
        assert.equal(f.events.length, 1);
        assert.deepEqual(f.errors, []);
    });
}

for (const failure of ['media', 'context', 'draw', 'blob']) {
    test(`dropzone video thumbnail ${failure} failure resolves null and releases its source`, async function (t) {
        const urls = mockUrls(t);
        const f = createFixture(t);
        const value = file('movie.mp4', 8, 'video/mp4');
        f.engine.addFiles(value);
        if (failure === 'context') f.canvasOptions.context = false;
        if (failure === 'draw') f.canvasOptions.drawError = new Error('cannot draw');
        if (failure === 'blob') f.canvasOptions.blob = null;
        const pending = f.engine.createThumbnail(value);
        const video = f.videos[0];
        video.emit(failure === 'media' ? 'error' : 'seeked');
        assert.equal(await pending, null);
        assert.equal(f.engine.createThumbnail(value), pending);
        video.emit('seeked');
        video.emit('error');
        assert.equal(video.pauses, 1);
        assert.equal(video.loads, 1);
        assert.deepEqual(urls.revoked, [urls.created[0].url]);
        assert.equal(urls.created.length, 1);
        assert.deepEqual(f.errors, []);
    });
}

test('dropzone video timeout is ten seconds and makes delayed media and blob callbacks inert', async function (t) {
    t.mock.timers.enable({apis: ['setTimeout']});
    const urls = mockUrls(t);
    const f = createFixture(t);
    f.canvasOptions.deferBlob = true;
    const value = file('movie.mp4', 8, 'video/mp4');
    f.engine.addFiles(value);
    const pending = f.engine.createThumbnail(value);
    let resolved = false;
    pending.then(() => { resolved = true; });
    const video = f.videos[0];
    video.emit('seeked');
    t.mock.timers.tick(9999);
    await settle();
    assert.equal(resolved, false);
    assert.deepEqual(urls.revoked, []);
    t.mock.timers.tick(1);
    assert.equal(await pending, null);
    for (const {type, handler} of video.registrations) handler({type});
    f.canvases[0].callbacks[0](f.canvasOptions.blob);
    assert.equal(video.pauses, 1);
    assert.equal(video.loads, 1);
    assert.equal(urls.created.length, 1);
    assert.deepEqual(urls.revoked, [urls.created[0].url]);
});

for (const removal of ['remove', 'clear', 'replace', 'unheld']) {
    test(`dropzone ${removal} before an image promise settles returns null and revokes its URL`, async function (t) {
        const urls = mockUrls(t);
        const f = createFixture(t);
        const value = file('photo.png', 8, 'image/png');
        if (removal !== 'unheld') f.engine.addFiles(value);
        const pending = f.engine.createThumbnail(value);
        if (removal === 'remove') f.engine.removeFile(value);
        if (removal === 'clear') f.engine.clearFiles();
        if (removal === 'replace') f.engine.replaceFile(value, file('replacement'));
        assert.equal(await pending, null);
        await settle();
        assert.deepEqual(urls.revoked, [urls.created[0].url]);
    });
}

test('dropzone removing and re-adding the same File cannot revive its old pending thumbnail', async function (t) {
    const urls = mockUrls(t);
    const f = createFixture(t);
    const value = file('movie.mp4', 8, 'video/mp4');
    f.engine.addFiles(value);
    const old = f.engine.createThumbnail(value);
    f.engine.removeFile(value);
    f.engine.addFiles(value);
    const current = f.engine.createThumbnail(value);
    assert.notEqual(current, old);
    f.videos[0].emit('seeked');
    assert.equal(await old, null);
    const staleUrl = urls.created.at(-1).url;
    assert.equal(urls.revoked.filter(url => url === staleUrl).length, 1);
    f.videos[1].emit('seeked');
    const currentUrl = await current;
    assert.equal(currentUrl, urls.created.at(-1).url);
    assert.equal(f.engine.createThumbnail(value), current);
    assert.equal(urls.revoked.includes(currentUrl), false);
    f.engine.removeFile(value);
    await settle();
    assert.equal(urls.revoked.filter(url => url === currentUrl).length, 1);
});

for (const {version, mime, encoding, description} of [
    {version: 3, mime: 'image/jpeg', encoding: 0, description: [...Array(130).fill(65), 0]},
    {version: 3, mime: 'image/png', encoding: 1, description: [255, 254, 65, 0, 0, 0]},
    {version: 4, mime: 'image/jpeg', encoding: 0},
    {version: 4, mime: 'image/png', encoding: 1},
    {version: 4, mime: 'image/jpeg', encoding: 2, description: [0, 65, 0, 0]},
    {version: 4, mime: 'image/png', encoding: 3, description: [...Array(130).fill(65), 0]},
]) {
    test(`dropzone ID3v2.${version} ${mime} encoding ${encoding} artwork is cached from metadata only`, async function (t) {
        const urls = mockUrls(t);
        const value = audioFile([artworkFrame({version, mime, encoding, description})], {version});
        const slice = value.slice.bind(value);
        const reads = t.mock.method(value, 'slice', (...args) => slice(...args));
        const f = createFixture(t);
        f.engine.addFiles(value);
        const pending = f.engine.createThumbnail(value);
        assert.equal(f.engine.createThumbnail(value), pending);
        const url = await pending;
        assert.equal(url, urls.created[0].url);
        assert.equal(urls.created[0].blob.type, mime);
        const signature = [...new Uint8Array(await urls.created[0].blob.arrayBuffer())];
        assert.deepEqual(signature, mime === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10, 1] : [255, 216, 255, 1]);
        assert.deepEqual(reads.mock.calls.map(call => call.arguments), [[0, 10], [10, value.size]]);
        assert.equal(f.engine.createThumbnail(value), pending);
        assert.equal(reads.mock.callCount(), 2);
        assert.equal(f.events.length, 1);
    });
}

for (const frontCover of [false, true]) {
    test(`dropzone audio chooses ${frontCover ? 'the front cover over an earlier image' : 'the first supported image when no front cover exists'}`, async function (t) {
        const urls = mockUrls(t);
        const first = [255, 216, 255, 11];
        const second = [255, 216, 255, 22];
        const value = audioFile([
            artworkFrame({id: 'TIT2'}),
            artworkFrame({pictureType: 4, picture: first}),
            artworkFrame({pictureType: frontCover ? 3 : 5, picture: second}),
        ]);
        const f = createFixture(t);
        f.engine.addFiles(value);
        assert.ok(await f.engine.createThumbnail(value));
        assert.deepEqual([...new Uint8Array(await urls.created[0].blob.arrayBuffer())], frontCover ? second : first);
    });
}

const malformedAudio = [
    ['short header', () => file('track.mp3', 4, 'audio/mpeg')],
    ['wrong signature', () => audioFile(undefined, {signature: 'TAG'})],
    ['unsupported version', () => audioFile(undefined, {version: 2})],
    ['nonzero revision', () => audioFile(undefined, {revision: 1})],
    ...[0x80, 0x40, 0x20, 0x10].map(flags => [`unsupported tag flag ${flags}`, () => audioFile(undefined, {flags})]),
    ['empty tag', () => audioFile([])],
    ['truncated tag', () => audioFile(undefined, {size: 4096})],
    ['invalid frame ID', () => audioFile([artworkFrame({id: 'apic'})])],
    ['zero frame size', () => audioFile([[65, 80, 73, 67, 0, 0, 0, 0, 0, 0]])],
    ['oversized frame', () => audioFile([[65, 80, 73, 67, 0, 0, 1, 0, 0, 0]])],
    ['nonsyncsafe v2.4 frame size', () => audioFile([[65, 80, 73, 67, 128, 0, 0, 0, 0, 0]], {version: 4})],
    ['transformed frame', () => audioFile([artworkFrame({flags: 8})])],
    ['unsupported encoding', () => audioFile([artworkFrame({encoding: 3})])],
    ['unsupported artwork MIME', () => audioFile([artworkFrame({mime: 'image/gif'})])],
    ['mismatched image signature', () => audioFile([artworkFrame({mime: 'image/png', picture: [255, 216, 255]})])],
    ['missing description terminator', () => audioFile([artworkFrame({description: [65, 66]})])],
    ['empty artwork', () => audioFile([artworkFrame({picture: []})])],
    ['tag padding only', () => audioFile([Array(12).fill(0)])],
];

for (const [name, makeFile] of malformedAudio) {
    test(`dropzone audio ${name} returns null without errors or object URLs`, async function (t) {
        const urls = mockUrls(t);
        const f = createFixture(t);
        const value = makeFile();
        f.engine.addFiles(value);
        const pending = f.engine.createThumbnail(value);
        assert.equal(await pending, null);
        assert.equal(f.engine.createThumbnail(value), pending);
        assert.deepEqual(urls.created, []);
        assert.deepEqual(f.errors, []);
    });
}

test('dropzone unreadable audio metadata returns null', async function (t) {
    const urls = mockUrls(t);
    const f = createFixture(t);
    const value = audioFile();
    t.mock.method(value, 'slice', () => ({arrayBuffer: () => Promise.reject(new Error('unreadable'))}));
    f.engine.addFiles(value);
    assert.equal(await f.engine.createThumbnail(value), null);
    assert.deepEqual(urls.created, []);
    assert.deepEqual(f.errors, []);
});

test('dropzone audio removed during metadata decoding cannot retain its late artwork', async function (t) {
    const urls = mockUrls(t);
    const f = createFixture(t);
    const value = audioFile();
    const data = deferred();
    const slice = value.slice.bind(value);
    t.mock.method(value, 'slice', (start, end) => start === 0 ? slice(start, end) : {arrayBuffer: () => data.promise});
    f.engine.addFiles(value);
    const pending = f.engine.createThumbnail(value);
    await settle();
    f.engine.removeFile(value);
    data.resolve(await slice(10).arrayBuffer());
    assert.equal(await pending, null);
    assert.equal(urls.created.length, 1);
    assert.deepEqual(urls.revoked, [urls.created[0].url]);
});
