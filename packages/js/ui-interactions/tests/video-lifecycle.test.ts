import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDeferred, createFixture, createHost} from './helpers/video.ts';

test('video destruction removes exact listener identities and makes retained handlers inert', function (t) {
    const host = createHost({mediaSession: true});
    const f = createFixture(t, {playerContainer: host.container, mediaSession: {}, watchProgress: true, videoId: 'episode'}, host);
    const registered = [...f.video.registrations, ...f.container.registrations, ...f.ownerDocument.registrations];
    assert.equal(registered.length, 24);
    const seekto = f.mediaSession.handlers.get('seekto');
    const pause = f.mediaSession.handlers.get('pause');
    f.video.currentTime = 30;
    f.engine.destroy();
    assert.deepEqual(f.video.removals, f.video.registrations);
    assert.deepEqual(f.container.removals, f.container.registrations);
    assert.deepEqual(f.ownerDocument.removals, f.ownerDocument.registrations);
    assert.ok([...f.video.handlers.values(), ...f.container.handlers.values()].every(handlers => handlers.size === 0));
    const writes = f.storage.writes.length;
    const events = f.events.length;
    f.video.currentTime = 50;
    for (const {handler, type} of registered) handler({type, key: 'Home', target: f.video, preventDefault() {}});
    seekto({seekTime: 5, fastSeek: true});
    pause({});
    assert.equal(f.video.currentTime, 50);
    assert.deepEqual(f.video.fastSeeks, []);
    assert.equal(f.storage.writes.length, writes);
    assert.equal(f.events.length, events);
    assert.deepEqual(f.errors, []);
    f.engine.destroy();
    assert.deepEqual(f.video.removals, f.video.registrations);
});

test('video public mutations return neutral results after teardown while reads remain available', async function (t) {
    const f = createFixture(t);
    f.engine.seek(20);
    f.engine.destroy();
    const calls = [
        ['load'], ['setSources', null], ['play'], ['pause'], ['stop'], ['seek', -1], ['seekForward', 0], ['seekBackward', 0],
        ['seekToPercent', -1], ['setVolume', 2], ['increaseVolume', 2], ['decreaseVolume', 2], ['setMuted', null], ['toggleMuted'],
        ['setAutoplay', null], ['setLoop', null], ['toggleLoop'], ['setMediaSession', false], ['setAbLoopStart', -1], ['setAbLoopEnd', -1],
        ['clearAbLoop'], ['retry'], ['clearPersistedSettings'], ['setPlaybackRate', 10], ['increasePlaybackRate', 0], ['decreasePlaybackRate', 0],
        ['resetPlaybackRate'], ['setCaption', null], ['setKeyboardShortcuts', null], ['setTouchGestures', null], ['resumeWatchProgress'],
        ['enterFullscreen'], ['exitFullscreen'], ['enterPictureInPicture'], ['exitPictureInPicture'],
    ];
    for (const [method, ...args] of calls) assert.equal(await f.engine[method](...args), false, method);
    assert.equal(f.engine.togglePlayback(), undefined);
    let callsAfterDestroy = 0;
    const unsubscribe = f.engine.subscribe(() => callsAfterDestroy++);
    unsubscribe();
    f.video.dispatch('progress');
    assert.equal(callsAfterDestroy, 0);
    assert.equal(f.engine.getState().currentTime, 20);
    assert.equal(f.engine.getSeekPreviewAtPercent(50).time, 60);
    assert.equal(f.engine.listKeyboardShortcuts().length, 10);
    assert.equal(f.video.playCalls, 0);
    assert.equal(f.video.loadCalls, 0);
});

test('video destruction during state delivery suppresses later listeners and autoplay work', async function (t) {
    const f = createFixture(t);
    const later = [];
    f.engine.subscribe(() => f.engine.destroy());
    f.engine.subscribe(state => later.push(state));
    assert.equal(await f.engine.setAutoplay(true), false);
    assert.equal(f.video.playCalls, 0);
    assert.deepEqual(later, []);
    assert.equal(f.events.length, 1);
});

test('video pending manual play and autoplay completions are inert after destruction', async function (t) {
    for (const method of ['play', 'setAutoplay']) {
        for (const outcome of ['resolve', 'reject']) {
            const f = createFixture(t);
            const deferred = createDeferred();
            f.video.playHook = () => deferred.promise;
            const pending = method === 'play' ? f.engine.play() : f.engine.setAutoplay(true);
            f.engine.destroy();
            const events = f.events.length;
            if (outcome === 'resolve') deferred.resolve();
            else deferred.reject({name: 'NotAllowedError'});
            assert.equal(await pending, false, `${method} ${outcome}`);
            assert.equal(f.events.length, events);
            assert.deepEqual(f.errors, []);
            assert.equal(f.engine.getState().autoplayBlocked, false);
        }
    }
});

test('video destruction during AB-loop delivery stops the handler before another progress save', function (t) {
    const f = createFixture(t, {watchProgress: true, videoId: 'episode', watchProgressSaveInterval: 0});
    f.engine.setAbLoopStart(10);
    f.engine.setAbLoopEnd(20);
    f.engine.subscribe(() => f.engine.destroy());
    f.video.currentTime = 25;
    f.video.dispatch('timeupdate');
    assert.equal(f.video.currentTime, 10);
    assert.equal(f.storage.writes.length, 1);
    assert.equal(JSON.parse(f.storage.writes[0].value).currentTime, 10);
});

test('video source replacement stops when its inner delivery destroys the engine', function (t) {
    const f = createFixture(t, {mediaSession: {}}, createHost({mediaSession: true}));
    f.engine.setPlaybackRate(1.5);
    f.engine.subscribe(() => f.engine.destroy());
    assert.equal(f.engine.setSources([{src: 'new.mp3'}]), false);
    assert.equal(f.video.playbackRate, 1);
    assert.ok([...f.mediaSession.handlers.values()].every(handler => handler === null));
    assert.equal(f.mediaSession.playbackState, 'none');
    assert.equal(f.mediaSession.metadata, null);
});

test('video source replacement stops after a synchronous native pause callback destroys it', function (t) {
    const f = createFixture(t, {}, createHost({video: {paused: false}}));
    f.video.pauseHook = () => f.video.dispatch('pause');
    f.engine.subscribe(() => f.engine.destroy());
    assert.equal(f.engine.setSources([{src: 'new.mp3'}]), false);
    assert.equal(f.video.src, 'https://video.test/movie.mp4');
    assert.equal(f.video.loadCalls, 0);
    assert.equal(f.children.length, 0);
});

test('video marks itself destroyed before external cleanup can reenter public setters', function (t) {
    const host = createHost({mediaSession: true});
    const f = createFixture(t, {mediaSession: {}}, host);
    const attempts = [];
    host.mediaSession.setActionHandler = (action, handler) => {
        if (handler === null) attempts.push(f.engine.seek(100));
    };
    f.engine.destroy();
    assert.deepEqual(attempts, [false, false, false, false, false, false]);
    assert.equal(f.video.currentTime, 0);
    assert.deepEqual(f.events, []);
});

test('video instances keep playback, subscribers and owning-document resources independent', function (t) {
    const first = createFixture(t, {mediaSession: {}}, createHost({mediaSession: true}));
    const second = createFixture(t, {mediaSession: {}}, createHost({mediaSession: true}));
    first.engine.seek(10);
    assert.equal(second.events.length, 0);
    first.engine.destroy();
    second.engine.seek(20);
    assert.equal(second.events.length, 1);
    assert.equal(second.video.currentTime, 20);
    assert.equal(second.mediaSession.handlers.get('play') instanceof Function, true);
    assert.equal(second.video.removals.length, 0);
});
