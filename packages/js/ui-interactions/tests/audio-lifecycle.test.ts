import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDeferred, createFixture, createHost} from './helpers/audio.ts';

test('audio destruction removes exact listener identities and makes retained handlers inert', function (t) {
    const host = createHost({mediaSession: true});
    const f = createFixture(t, {playerContainer: host.container, mediaSession: {}, watchProgress: true, audioId: 'episode'}, host);
    const registered = [...f.audio.registrations, ...f.container.registrations];
    assert.equal(registered.length, 18);
    const seekto = f.mediaSession.handlers.get('seekto');
    const pause = f.mediaSession.handlers.get('pause');
    f.audio.currentTime = 30;
    f.engine.destroy();
    assert.deepEqual(f.audio.removals, f.audio.registrations);
    assert.deepEqual(f.container.removals, f.container.registrations);
    assert.ok([...f.audio.handlers.values(), ...f.container.handlers.values()].every(handlers => handlers.size === 0));
    const writes = f.storage.writes.length;
    const events = f.events.length;
    f.audio.currentTime = 50;
    for (const {handler, type} of registered) handler({type, key: 'Home', target: f.audio, preventDefault() {}});
    seekto({seekTime: 5, fastSeek: true});
    pause({});
    assert.equal(f.audio.currentTime, 50);
    assert.deepEqual(f.audio.fastSeeks, []);
    assert.equal(f.storage.writes.length, writes);
    assert.equal(f.events.length, events);
    assert.deepEqual(f.errors, []);
    f.engine.destroy();
    assert.deepEqual(f.audio.removals, f.audio.registrations);
});

test('audio public mutations return neutral results after teardown while reads remain available', async function (t) {
    const f = createFixture(t);
    f.engine.seek(20);
    f.engine.destroy();
    const calls = [
        ['load'], ['setSources', null], ['play'], ['pause'], ['stop'], ['seek', -1], ['seekForward', 0], ['seekBackward', 0],
        ['seekToPercent', -1], ['setVolume', 2], ['increaseVolume', 2], ['decreaseVolume', 2], ['setMuted', null], ['toggleMuted'],
        ['setAutoplay', null], ['setLoop', null], ['toggleLoop'], ['setMediaSession', false], ['setAbLoopStart', -1], ['setAbLoopEnd', -1],
        ['clearAbLoop'], ['retry'], ['clearPersistedSettings'], ['setPlaybackRate', 10], ['increasePlaybackRate', 0], ['decreasePlaybackRate', 0],
        ['resetPlaybackRate'], ['setPitch', NaN], ['setKeyboardShortcuts', null], ['resumeWatchProgress'],
    ];
    for (const [method, ...args] of calls) assert.equal(await f.engine[method](...args), false, method);
    assert.equal(f.engine.togglePlayback(), undefined);
    let callsAfterDestroy = 0;
    const unsubscribe = f.engine.subscribe(() => callsAfterDestroy++);
    unsubscribe();
    f.audio.dispatch('progress');
    assert.equal(callsAfterDestroy, 0);
    assert.equal(f.engine.getState().currentTime, 20);
    assert.equal(f.engine.getSeekPreviewAtPercent(50).time, 60);
    assert.equal(f.engine.listKeyboardShortcuts().length, 9);
    assert.equal(f.audio.playCalls, 0);
    assert.equal(f.audio.loadCalls, 0);
});

test('audio destruction during state delivery suppresses later listeners and autoplay work', async function (t) {
    const f = createFixture(t);
    const later = [];
    f.engine.subscribe(() => f.engine.destroy());
    f.engine.subscribe(state => later.push(state));
    assert.equal(await f.engine.setAutoplay(true), false);
    assert.equal(f.audio.playCalls, 0);
    assert.deepEqual(later, []);
    assert.equal(f.events.length, 1);
});

test('audio pending manual play and autoplay completions are inert after destruction', async function (t) {
    for (const method of ['play', 'setAutoplay']) {
        for (const outcome of ['resolve', 'reject']) {
            const f = createFixture(t);
            const deferred = createDeferred();
            f.audio.playHook = () => deferred.promise;
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

test('audio destruction during AB-loop delivery stops the handler before another progress save', function (t) {
    const f = createFixture(t, {watchProgress: true, audioId: 'episode', watchProgressSaveInterval: 0});
    f.engine.setAbLoopStart(10);
    f.engine.setAbLoopEnd(20);
    f.engine.subscribe(() => f.engine.destroy());
    f.audio.currentTime = 25;
    f.audio.dispatch('timeupdate');
    assert.equal(f.audio.currentTime, 10);
    assert.equal(f.storage.writes.length, 1);
    assert.equal(JSON.parse(f.storage.writes[0].value).currentTime, 10);
});

test('audio source replacement stops when its inner delivery destroys the engine', function (t) {
    const f = createFixture(t, {mediaSession: {}}, createHost({mediaSession: true}));
    f.engine.setPlaybackRate(1.5);
    f.engine.subscribe(() => f.engine.destroy());
    assert.equal(f.engine.setSources([{src: 'new.mp3'}]), false);
    assert.equal(f.audio.playbackRate, 1);
    assert.ok([...f.mediaSession.handlers.values()].every(handler => handler === null));
    assert.equal(f.mediaSession.playbackState, 'none');
    assert.equal(f.mediaSession.metadata, null);
});

test('audio source replacement stops after a synchronous native pause callback destroys it', function (t) {
    const f = createFixture(t, {}, createHost({audio: {paused: false}}));
    f.audio.pauseHook = () => f.audio.dispatch('pause');
    f.engine.subscribe(() => f.engine.destroy());
    assert.equal(f.engine.setSources([{src: 'new.mp3'}]), false);
    assert.equal(f.audio.src, 'https://audio.test/song.mp3');
    assert.equal(f.audio.loadCalls, 0);
    assert.equal(f.children.length, 0);
});

test('audio marks itself destroyed before external cleanup can reenter public setters', function (t) {
    const host = createHost({mediaSession: true});
    const f = createFixture(t, {mediaSession: {}}, host);
    const attempts = [];
    host.mediaSession.setActionHandler = (action, handler) => {
        if (handler === null) attempts.push(f.engine.seek(100));
    };
    f.engine.destroy();
    assert.deepEqual(attempts, [false, false, false, false, false, false]);
    assert.equal(f.audio.currentTime, 0);
    assert.deepEqual(f.events, []);
});

test('audio instances keep playback, subscribers and owning-document resources independent', function (t) {
    const first = createFixture(t, {mediaSession: {}}, createHost({mediaSession: true}));
    const second = createFixture(t, {mediaSession: {}}, createHost({mediaSession: true}));
    first.engine.seek(10);
    assert.equal(second.events.length, 0);
    first.engine.destroy();
    second.engine.seek(20);
    assert.equal(second.events.length, 1);
    assert.equal(second.audio.currentTime, 20);
    assert.equal(second.mediaSession.handlers.get('play') instanceof Function, true);
    assert.equal(second.audio.removals.length, 0);
});
