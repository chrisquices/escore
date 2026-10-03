import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDeferred, createFixture, createHost, settle} from './helpers/video.ts';

test('video sources use the owning document and reload while preserving selected playback rate', function (t) {
    const f = createFixture(t, {sources: [{src: 'first.mp3', type: 'video/mpeg'}, {src: 'first.ogg'}]});
    assert.equal(f.video.loadCalls, 1);
    assert.equal(f.video.src, '');
    assert.equal(f.created.length, 2);
    assert.deepEqual(f.engine.getState().sources, [{src: 'first.mp3', type: 'video/mpeg'}, {src: 'first.ogg', type: ''}]);
    assert.equal(f.events.length, 1);
    f.engine.setPlaybackRate(1.5);
    assert.equal(f.engine.setSources([{src: 'next.mp3'}]), true);
    assert.equal(f.video.playbackRate, 1.5);
    assert.equal(f.video.loadCalls, 2);
    assert.deepEqual(f.engine.getState().sources, [{src: 'next.mp3', type: ''}]);
    assert.equal(f.engine.setSources([]), true);
    assert.deepEqual(f.engine.getState().sources, []);
    assert.equal(f.engine.getState().source, '');
});

test('video play, pause, stop, toggle and retry retain boolean contracts', async function (t) {
    const f = createFixture(t);
    assert.equal(await f.engine.play(), true);
    assert.equal(f.engine.getState().playing, true);
    assert.equal(await f.engine.play(), true);
    assert.equal(f.video.playCalls, 1);
    assert.equal(f.engine.pause(), true);
    assert.equal(f.engine.pause(), true);
    assert.equal(f.video.pauseCalls, 1);
    f.engine.seek(40);
    assert.equal(f.engine.stop(), true);
    assert.equal(f.video.currentTime, 0);
    f.engine.togglePlayback();
    await settle();
    assert.equal(f.video.paused, false);
    f.engine.togglePlayback();
    assert.equal(f.video.paused, true);
    assert.equal(await f.engine.retry(), true);
    assert.equal(f.video.loadCalls, 1);
    assert.equal(f.video.paused, false);
    f.engine.seek(40);
    assert.equal(f.engine.stop(), true);
    assert.equal(f.video.paused, true);
    assert.equal(f.video.currentTime, 0);
});

test('video load clears transient buffering, AB loop and restoration', function (t) {
    const f = createFixture(t, {watchProgress: true, videoId: 'episode'});
    f.engine.resumeWatchProgress();
    f.engine.setAbLoopStart(20);
    f.engine.setAbLoopEnd(40);
    f.video.dispatch('waiting');
    assert.equal(f.engine.load(), true);
    const state = f.engine.getState();
    assert.equal(state.buffering, false);
    assert.equal(state.abLoopPhase, 'idle');
    assert.equal(state.watchProgress.restored, false);
});

test('video seeks and previews clamp against known bounds and validate existing numeric coercions', function (t) {
    const f = createFixture(t);
    assert.equal(f.engine.seek('15'), true);
    assert.equal(f.engine.seek(15), false);
    assert.equal(f.engine.seekForward(), true);
    assert.equal(f.video.currentTime, 25);
    f.engine.seekBackward(100);
    assert.equal(f.video.currentTime, 0);
    f.engine.seek(999);
    assert.equal(f.video.currentTime, 120);
    assert.equal(f.engine.seekForward(), false);
    assert.equal(f.engine.seekToPercent(25), true);
    assert.equal(f.video.currentTime, 30);
    assert.equal(f.engine.getSeekTimeAtPercent(50), 60);
    assert.deepEqual(f.engine.getSeekPreviewAtPercent(25), {percent: 25, time: 30, timeFormatted: '0:30', remainingTime: 90, remainingTimeFormatted: '-1:30', thumbnail: null});
    assert.equal(f.engine.getSeekPreviewAtPosition(-10, 200).percent, 0);
    assert.equal(f.engine.getSeekPreviewAtPosition(300, 200).percent, 100);
    assert.equal(f.engine.getSeekPreviewAtPosition(50, 200).time, 30);
    for (const method of ['seek', 'setAbLoopStart', 'setAbLoopEnd']) {
        for (const value of [-1, NaN, Infinity]) assert.throws(() => f.engine[method](value), /createVideo:/);
    }
    for (const method of ['seekForward', 'seekBackward']) {
        for (const value of [0, -1, NaN, Infinity]) assert.throws(() => f.engine[method](value), /createVideo:/);
    }
    for (const method of ['seekToPercent', 'getSeekTimeAtPercent', 'getSeekPreviewAtPercent']) {
        for (const value of [-1, 101, NaN, Infinity]) assert.throws(() => f.engine[method](value), /createVideo:/);
    }
    for (const [position, width] of [[Infinity, 1], [0, 0], [0, -1], [0, NaN]]) assert.throws(() => f.engine.getSeekPreviewAtPosition(position, width), /createVideo:/);
    f.video.duration = NaN;
    assert.equal(f.engine.seek(300), true);
    assert.equal(f.video.currentTime, 300);
});

test('video playback rate, volume, mute and loop respect limits, no-ops and returns', function (t) {
    const f = createFixture(t);
    assert.equal(f.engine.setPlaybackRate('1.5'), true);
    assert.equal(f.engine.setPlaybackRate(1.5), false);
    f.engine.increasePlaybackRate(10);
    assert.equal(f.video.playbackRate, 2);
    assert.equal(f.engine.increasePlaybackRate(), false);
    f.engine.decreasePlaybackRate(10);
    assert.equal(f.video.playbackRate, 0.5);
    assert.equal(f.engine.decreasePlaybackRate(), false);
    assert.equal(f.engine.resetPlaybackRate(), true);
    assert.equal(f.engine.resetPlaybackRate(), false);
    for (const value of [0, 2.1, NaN, Infinity]) assert.throws(() => f.engine.setPlaybackRate(value), /playback rate/);
    for (const method of ['increasePlaybackRate', 'decreasePlaybackRate']) {
        for (const value of [0, -1, NaN]) assert.throws(() => f.engine[method](value), /step/);
    }
    assert.equal(f.engine.setVolume(0.5), true);
    assert.equal(f.engine.setVolume(0.5), false);
    f.engine.setMuted(true);
    assert.equal(f.engine.setVolume(0.5), true);
    assert.equal(f.video.muted, false);
    f.engine.setMuted(true);
    f.engine.setVolume(0);
    assert.equal(f.video.muted, true);
    f.engine.increaseVolume();
    assert.equal(f.video.volume, 0.05);
    assert.equal(f.video.muted, false);
    f.engine.increaseVolume(1);
    assert.equal(f.video.volume, 1);
    f.engine.decreaseVolume(1);
    assert.equal(f.video.volume, 0);
    assert.equal(f.engine.decreaseVolume(), false);
    assert.equal(f.engine.increaseVolume(0), false);
    for (const method of ['setVolume', 'increaseVolume', 'decreaseVolume']) {
        for (const value of [-1, 1.1, NaN]) assert.throws(() => f.engine[method](value), /volume/);
    }
    assert.equal(f.engine.setLoop(false), true);
    assert.equal(f.engine.toggleLoop(), true);
    assert.equal(f.video.loop, true);
    assert.equal(f.engine.toggleMuted(), true);
    assert.equal(f.video.muted, true);
    for (const method of ['setMuted', 'setLoop', 'setKeyboardShortcuts', 'setTouchGestures']) assert.throws(() => f.engine[method](1), /boolean/);
});

test('video AB markers follow existing zero-start phases and rewind time updates', function (t) {
    const f = createFixture(t);
    assert.equal(f.engine.setAbLoopStart(0), true);
    assert.equal(f.engine.getState().abLoopPhase, 'idle');
    assert.equal(f.engine.setAbLoopEnd(0), false);
    assert.equal(f.engine.setAbLoopStart(20), true);
    assert.equal(f.engine.getState().abLoopPhase, 'pending');
    assert.equal(f.engine.setAbLoopEnd(40), true);
    assert.equal(f.engine.getState().abLoopPhase, 'looping');
    assert.equal(f.engine.setAbLoopEnd(40), true);
    f.video.currentTime = 45;
    f.video.dispatch('timeupdate');
    assert.equal(f.video.currentTime, 20);
    f.engine.setAbLoopStart(50);
    assert.equal(f.engine.getState().abLoopEnd, 0);
    f.engine.seek(70);
    f.engine.setAbLoopStart();
    f.engine.seek(80);
    f.engine.setAbLoopEnd();
    assert.equal(f.engine.getState().abLoopStart, 70);
    assert.equal(f.engine.getState().abLoopEnd, 80);
    assert.equal(f.engine.clearAbLoop(), true);
    assert.equal(f.engine.clearAbLoop(), true);
});

test('video autoplay publishes attempts, success and rejection without reporting normal policy errors', async function (t) {
    const success = createFixture(t, {autoplay: true});
    assert.equal(success.events[0].autoplayAttempted, true);
    await settle();
    assert.equal(success.engine.getState().playing, true);
    const f = createFixture(t);
    f.video.playHook = () => Promise.reject({name: 'NotAllowedError'});
    assert.equal(await f.engine.setAutoplay(true), false);
    assert.equal(f.engine.getState().autoplayBlocked, true);
    assert.deepEqual(f.errors, []);
    assert.equal(await f.engine.setAutoplay(false), true);
    assert.equal(f.engine.getState().autoplayBlocked, false);
    assert.equal(f.engine.getState().autoplayAttempted, true);
    f.video.playHook = () => Promise.reject({name: 'AbortError'});
    assert.equal(await f.engine.setAutoplay(true), false);
    assert.equal(f.engine.getState().autoplayBlocked, false);
    await assert.rejects(f.engine.setAutoplay(1), /boolean/);
});

test('video stale autoplay rejections cannot block a disabled or newer attempt', async function (t) {
    const f = createFixture(t);
    const first = createDeferred();
    f.video.playHook = () => first.promise;
    const old = f.engine.setAutoplay(true);
    await f.engine.setAutoplay(false);
    first.reject({name: 'NotAllowedError'});
    assert.equal(await old, false);
    assert.equal(f.engine.getState().autoplayBlocked, false);
    const second = createDeferred();
    f.video.playHook = () => second.promise;
    const stale = f.engine.setAutoplay(true);
    f.video.playHook = null;
    assert.equal(await f.engine.setAutoplay(true), true);
    second.reject({name: 'NotAllowedError'});
    assert.equal(await stale, false);
    assert.equal(f.engine.getState().autoplayBlocked, false);
    assert.equal(f.engine.getState().playing, true);
});

test('video explicit reentrant rate choices survive source replacement restoration', function (t) {
    for (const rate of [1, 2]) {
        const f = createFixture(t);
        f.engine.setPlaybackRate(1.5);
        let selected = false;
        f.engine.subscribe(state => {
            if (state.source === 'new.mp4' && !selected) {
                selected = true;
                f.engine.setPlaybackRate(rate);
            }
        });
        assert.equal(f.engine.setSources([{src: 'new.mp4'}]), true);
        assert.equal(f.video.playbackRate, rate);
        assert.equal(f.events.at(-1).playbackRate, rate);
    }
});

test('video autoplay applies configured mute and inline playback while explicit retry can clear a block', async function (t) {
    const f = createFixture(t, {autoplayMuted: true, poster: 'poster.jpg'});
    f.video.playHook = () => Promise.reject({name: 'NotAllowedError'});
    assert.equal(await f.engine.setAutoplay(true), false);
    assert.equal(f.video.muted, true);
    assert.equal(f.video.playsInline, true);
    assert.equal(f.engine.getState().autoplayBlocked, true);
    assert.equal(f.video.playCalls, 1);
    assert.equal(f.video.poster, 'poster.jpg');
    f.video.playHook = null;
    assert.equal(await f.engine.setAutoplay(true), true);
    assert.equal(f.video.playCalls, 2);
    assert.equal(f.engine.getState().autoplayBlocked, false);
    assert.equal(f.engine.getState().playing, true);
    assert.deepEqual(f.errors, []);
});

test('video poster clears on native play, successful manual play and teardown', async function (t) {
    for (const path of ['event', 'manual', 'destroy']) {
        const f = createFixture(t, {poster: 'poster.jpg'});
        assert.equal(f.engine.getState().poster, 'poster.jpg');
        if (path === 'event') f.video.dispatch('play');
        else if (path === 'manual') await f.engine.play();
        else f.engine.destroy();
        assert.equal(f.video.poster, '');
        if (path !== 'destroy') assert.equal(f.events.at(-1).poster, '');
    }
});
