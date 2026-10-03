import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDeferred, createFixture, settle} from './helpers/video.ts';

function createVtt(sprite = 'sprites.jpg') {
    return `WEBVTT\r\n\r\n1\r\n00:00:00.000 --> 00:01:00.000\r\n${sprite}#xywh=10,20,100,50\r\n\r\n2\r\n01:00.000 --> 02:00.000\r\n${sprite}#xywh=110,20,100,50\r\n`;
}

function createResponse(text) { return {ok: true, text: async () => text}; }

test('video VTT previews resolve relative sprite URLs and retain the existing scale and last-cue fallback', async function (t) {
    const f = createFixture(t, {thumbnails: 'previews/index.vtt', thumbnailScale: 0.5});
    assert.equal(f.fetches[0].url, 'previews/index.vtt');
    assert.equal(f.engine.getSeekPreviewAtPercent(25).thumbnail, null);
    f.fetches[0].resolve(createResponse(createVtt()));
    await settle();
    const thumbnail = f.engine.getSeekPreviewAtPercent(25).thumbnail;
    assert.deepEqual(thumbnail, {
        src: 'https://video.test/player/previews/sprites.jpg', x: 10, y: 20, width: 100, height: 50,
        style: {backgroundImage: 'url(https://video.test/player/previews/sprites.jpg)', backgroundPosition: '-5px -10px', backgroundSize: '500px 250px', width: '50px', height: '25px'},
    });
    assert.equal(f.engine.getSeekPreviewAtPercent(50).thumbnail.x, 110);
    assert.equal(f.engine.getSeekPreviewAtPercent(100).thumbnail.x, 110);
    thumbnail.style.width = 'poison';
    assert.equal(f.engine.getSeekPreviewAtPosition(50, 200).thumbnail.style.width, '50px');
    // Preview data is read through preview helpers; it is not a field of VideoState.
    assert.deepEqual(f.events, []);
});

test('video VTT parsing skips missing and unsupported payloads without expanding the supported format', async function (t) {
    const f = createFixture(t, {thumbnails: 'https://cdn.test/path/index.vtt'});
    f.fetches[0].resolve(createResponse(`WEBVTT\n\n00:00 --> 00:10\n\n00:10 --> 00:20\ninvalid.jpg\n\n00:20 --> 00:30\na.jpg#xywh=-1,0,100,50\n\n00:30 --> 00:40\n00:40 --> 00:50\n/sprite.png#xywh=0,0,80,40\n`));
    await settle();
    assert.equal(f.engine.getSeekPreviewAtPercent(0).thumbnail.src, 'https://cdn.test/sprite.png');
    assert.equal(f.engine.getSeekPreviewAtPercent(0).thumbnail.width, 80);
    f.engine.load();
    assert.equal(f.engine.getSeekPreviewAtPercent(10).thumbnail, null);
    f.fetches[1].resolve(createResponse('WEBVTT\n\n00:00 --> 00:10\ninvalid\n'));
    await settle();
    assert.equal(f.engine.getSeekPreviewAtPercent(10).thumbnail, null);
    assert.deepEqual(f.errors, []);
});

test('video thumbnail fetch, HTTP and body failures report the existing error contract', async function (t) {
    for (const failure of ['fetch', 'http', 'text']) {
        const f = createFixture(t, {thumbnails: 'index.vtt'});
        if (failure === 'fetch') f.fetches[0].reject(new Error('offline'));
        else f.fetches[0].resolve(failure === 'http' ? {ok: false, status: 404} : {ok: true, text: () => Promise.reject(new Error('body'))});
        await settle();
        assert.deepEqual(f.errors, [{id: 'preview-thumbnails-load-failed', message: 'Preview thumbnails could not be loaded.', metadata: null}]);
        assert.equal(f.engine.getSeekPreviewAtPercent(25).thumbnail, null);
        assert.deepEqual(f.events, []);
    }
});

test('video new thumbnail loads supersede pending responses and pending bodies', async function (t) {
    for (const pendingStage of ['response', 'body']) {
        const f = createFixture(t, {thumbnails: 'index.vtt'});
        const body = createDeferred();
        if (pendingStage === 'body') {
            f.fetches[0].resolve({ok: true, text: () => body.promise});
            await settle();
        }
        f.engine.load();
        f.fetches[1].resolve(createResponse(createVtt('new.jpg')));
        await settle();
        if (pendingStage === 'response') f.fetches[0].resolve(createResponse(createVtt('old.jpg')));
        else body.resolve(createVtt('old.jpg'));
        await settle();
        assert.equal(f.engine.getSeekPreviewAtPercent(25).thumbnail.src, 'https://video.test/player/new.jpg');
        assert.deepEqual(f.errors, []);
    }
    const f = createFixture(t, {thumbnails: 'index.vtt'});
    f.engine.load();
    f.fetches[1].resolve(createResponse(createVtt('new.jpg')));
    await settle();
    f.fetches[0].reject(new Error('stale failure'));
    await settle();
    assert.deepEqual(f.errors, []);
    assert.equal(f.engine.getSeekPreviewAtPercent(25).thumbnail.src, 'https://video.test/player/new.jpg');
});

test('video thumbnail response and body completions are inert after destruction', async function (t) {
    for (const stage of ['response', 'body']) {
        for (const outcome of ['resolve', 'reject']) {
            const f = createFixture(t, {thumbnails: 'index.vtt'});
            const body = createDeferred();
            if (stage === 'body') { f.fetches[0].resolve({ok: true, text: () => body.promise}); await settle(); }
            f.engine.destroy();
            const pending = stage === 'body' ? body : f.fetches[0];
            if (outcome === 'reject') pending.reject(new Error('late'));
            else pending.resolve(stage === 'body' ? createVtt() : createResponse(createVtt()));
            await settle();
            assert.equal(f.engine.getSeekPreviewAtPercent(25).thumbnail, null);
            assert.deepEqual(f.errors, []);
            assert.deepEqual(f.events, []);
        }
    }
    const loaded = createFixture(t, {thumbnails: 'index.vtt'});
    loaded.fetches[0].resolve(createResponse(createVtt()));
    await settle();
    assert.ok(loaded.engine.getSeekPreviewAtPercent(25).thumbnail);
    loaded.engine.destroy();
    assert.equal(loaded.engine.getSeekPreviewAtPercent(25).thumbnail, null);
});
