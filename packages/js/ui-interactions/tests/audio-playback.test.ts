import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDeferred, createFixture, createHost, settle} from './helpers/audio.ts';

test('audio sources use the owning document and reload while preserving selected playback rate', function (t) {
    const f = createFixture(t, {sources: [{src: 'first.mp3', type: 'audio/mpeg'}, {src: 'first.ogg'}]});
    assert.equal(f.audio.loadCalls, 1);
    assert.equal(f.audio.src, '');
    assert.equal(f.created.length, 2);
    assert.deepEqual(f.engine.getState().sources, [{src: 'first.mp3', type: 'audio/mpeg'}, {src: 'first.ogg', type: ''}]);
    assert.equal(f.events.length, 1);
    f.engine.setPlaybackRate(1.5);
    assert.equal(f.engine.setSources([{src: 'next.mp3'}]), true);
    assert.equal(f.audio.playbackRate, 1.5);
    assert.equal(f.audio.loadCalls, 2);
    assert.deepEqual(f.engine.getState().sources, [{src: 'next.mp3', type: ''}]);
    assert.equal(f.engine.setSources([]), true);
    assert.deepEqual(f.engine.getState().sources, []);
    assert.equal(f.engine.getState().source, '');
});

test('audio explicit reentrant rate choices survive source replacement restoration', async function (t) {
    for (const rate of [1, 2]) {
        await t.test(`rate ${rate}`, function (t) {
            const f = createFixture(t);
            f.engine.setPlaybackRate(1.5);
            let selected = false;
            let selectionResult;
            f.engine.subscribe(state => {
                if (state.source === 'new.mp3' && !selected) {
                    selected = true;
                    selectionResult = f.engine.setPlaybackRate(rate);
                }
            });
            assert.equal(f.engine.setSources([{src: 'new.mp3'}]), true);
            assert.equal(selected, true);
            assert.equal(selectionResult, rate !== 1);
            assert.equal(f.audio.playbackRate, rate);
            assert.equal(f.engine.getState().playbackRate, rate);
            assert.equal(f.events.at(-1).playbackRate, rate);
            const count = f.events.length;
            f.audio.dispatch('ratechange');
            f.audio.dispatch('progress');
            assert.equal(f.events.length, count);
        });
    }
});

test('audio play, pause, stop, toggle and retry retain boolean contracts', async function (t) {
    const f = createFixture(t);
    assert.equal(await f.engine.play(), true);
    assert.equal(f.engine.getState().playing, true);
    assert.equal(await f.engine.play(), true);
    assert.equal(f.audio.playCalls, 1);
    assert.equal(f.engine.pause(), true);
    assert.equal(f.engine.pause(), true);
    assert.equal(f.audio.pauseCalls, 1);
    f.engine.seek(40);
    assert.equal(f.engine.stop(), true);
    assert.equal(f.audio.currentTime, 0);
    f.engine.togglePlayback();
    await settle();
    assert.equal(f.audio.paused, false);
    f.engine.togglePlayback();
    assert.equal(f.audio.paused, true);
    assert.equal(await f.engine.retry(), true);
    assert.equal(f.audio.loadCalls, 1);
    assert.equal(f.audio.paused, false);
    f.engine.seek(40);
    assert.equal(f.engine.stop(), true);
    assert.equal(f.audio.paused, true);
    assert.equal(f.audio.currentTime, 0);
});

test('audio load clears transient buffering, AB loop and restoration', function (t) {
    const f = createFixture(t, {watchProgress: true, audioId: 'episode'});
    f.engine.resumeWatchProgress();
    f.engine.setAbLoopStart(20);
    f.engine.setAbLoopEnd(40);
    f.audio.dispatch('waiting');
    assert.equal(f.engine.load(), true);
    const state = f.engine.getState();
    assert.equal(state.buffering, false);
    assert.equal(state.abLoopPhase, 'idle');
    assert.equal(state.watchProgress.restored, false);
});

test('audio seeks and previews clamp against known bounds and validate existing numeric coercions', function (t) {
    const f = createFixture(t);
    assert.equal(f.engine.seek('15'), true);
    assert.equal(f.engine.seek(15), false);
    assert.equal(f.engine.seekForward(), true);
    assert.equal(f.audio.currentTime, 25);
    f.engine.seekBackward(100);
    assert.equal(f.audio.currentTime, 0);
    f.engine.seek(999);
    assert.equal(f.audio.currentTime, 120);
    assert.equal(f.engine.seekForward(), false);
    assert.equal(f.engine.seekToPercent(25), true);
    assert.equal(f.audio.currentTime, 30);
    assert.equal(f.engine.getSeekTimeAtPercent(50), 60);
    assert.deepEqual(f.engine.getSeekPreviewAtPercent(25), {percent: 25, time: 30, timeFormatted: '0:30', remainingTime: 90, remainingTimeFormatted: '-1:30'});
    assert.equal(f.engine.getSeekPreviewAtPosition(-10, 200).percent, 0);
    assert.equal(f.engine.getSeekPreviewAtPosition(300, 200).percent, 100);
    assert.equal(f.engine.getSeekPreviewAtPosition(50, 200).time, 30);
    for (const method of ['seek', 'setAbLoopStart', 'setAbLoopEnd']) {
        for (const value of [-1, NaN, Infinity]) assert.throws(() => f.engine[method](value), /createAudio:/);
    }
    for (const method of ['seekForward', 'seekBackward']) {
        for (const value of [0, -1, NaN, Infinity]) assert.throws(() => f.engine[method](value), /createAudio:/);
    }
    for (const method of ['seekToPercent', 'getSeekTimeAtPercent', 'getSeekPreviewAtPercent']) {
        for (const value of [-1, 101, NaN, Infinity]) assert.throws(() => f.engine[method](value), /createAudio:/);
    }
    for (const [position, width] of [[Infinity, 1], [0, 0], [0, -1], [0, NaN]]) assert.throws(() => f.engine.getSeekPreviewAtPosition(position, width), /createAudio:/);
    f.audio.duration = NaN;
    assert.equal(f.engine.seek(300), true);
    assert.equal(f.audio.currentTime, 300);
});

test('audio playback rate, volume, mute and loop respect limits, no-ops and returns', function (t) {
    const f = createFixture(t);
    assert.equal(f.engine.setPlaybackRate('1.5'), true);
    assert.equal(f.engine.setPlaybackRate(1.5), false);
    f.engine.increasePlaybackRate(10);
    assert.equal(f.audio.playbackRate, 2);
    assert.equal(f.engine.increasePlaybackRate(), false);
    f.engine.decreasePlaybackRate(10);
    assert.equal(f.audio.playbackRate, 0.5);
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
    assert.equal(f.audio.muted, false);
    f.engine.setMuted(true);
    f.engine.setVolume(0);
    assert.equal(f.audio.muted, true);
    f.engine.increaseVolume();
    assert.equal(f.audio.volume, 0.05);
    assert.equal(f.audio.muted, false);
    f.engine.increaseVolume(1);
    assert.equal(f.audio.volume, 1);
    f.engine.decreaseVolume(1);
    assert.equal(f.audio.volume, 0);
    assert.equal(f.engine.decreaseVolume(), false);
    assert.equal(f.engine.increaseVolume(0), false);
    for (const method of ['setVolume', 'increaseVolume', 'decreaseVolume']) {
        for (const value of [-1, 1.1, NaN]) assert.throws(() => f.engine[method](value), /volume/);
    }
    assert.equal(f.engine.setLoop(false), true);
    assert.equal(f.engine.toggleLoop(), true);
    assert.equal(f.audio.loop, true);
    assert.equal(f.engine.toggleMuted(), true);
    assert.equal(f.audio.muted, true);
    for (const method of ['setMuted', 'setLoop', 'setKeyboardShortcuts']) assert.throws(() => f.engine[method](1), /boolean/);
});

test('audio AB markers follow existing zero-start phases and rewind time updates', function (t) {
    const f = createFixture(t);
    assert.equal(f.engine.setAbLoopStart(0), true);
    assert.equal(f.engine.getState().abLoopPhase, 'idle');
    assert.equal(f.engine.setAbLoopEnd(0), false);
    assert.equal(f.engine.setAbLoopStart(20), true);
    assert.equal(f.engine.getState().abLoopPhase, 'pending');
    assert.equal(f.engine.setAbLoopEnd(40), true);
    assert.equal(f.engine.getState().abLoopPhase, 'looping');
    assert.equal(f.engine.setAbLoopEnd(40), true);
    f.audio.currentTime = 45;
    f.audio.dispatch('timeupdate');
    assert.equal(f.audio.currentTime, 20);
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

test('audio autoplay publishes attempts, success and rejection without reporting normal policy errors', async function (t) {
    const success = createFixture(t, {autoplay: true});
    assert.equal(success.events[0].autoplayAttempted, true);
    await settle();
    assert.equal(success.engine.getState().playing, true);
    const f = createFixture(t);
    f.audio.playHook = () => Promise.reject({name: 'NotAllowedError'});
    assert.equal(await f.engine.setAutoplay(true), false);
    assert.equal(f.engine.getState().autoplayBlocked, true);
    assert.deepEqual(f.errors, []);
    assert.equal(await f.engine.setAutoplay(false), true);
    assert.equal(f.engine.getState().autoplayBlocked, false);
    assert.equal(f.engine.getState().autoplayAttempted, true);
    f.audio.playHook = () => Promise.reject({name: 'AbortError'});
    assert.equal(await f.engine.setAutoplay(true), false);
    assert.equal(f.engine.getState().autoplayBlocked, false);
    await assert.rejects(f.engine.setAutoplay(1), /boolean/);
});

test('audio stale autoplay rejections cannot block a disabled or newer attempt', async function (t) {
    const f = createFixture(t);
    const first = createDeferred();
    f.audio.playHook = () => first.promise;
    const old = f.engine.setAutoplay(true);
    await f.engine.setAutoplay(false);
    first.reject({name: 'NotAllowedError'});
    assert.equal(await old, false);
    assert.equal(f.engine.getState().autoplayBlocked, false);
    const second = createDeferred();
    f.audio.playHook = () => second.promise;
    const stale = f.engine.setAutoplay(true);
    f.audio.playHook = null;
    assert.equal(await f.engine.setAutoplay(true), true);
    second.reject({name: 'NotAllowedError'});
    assert.equal(await stale, false);
    assert.equal(f.engine.getState().autoplayBlocked, false);
    assert.equal(f.engine.getState().playing, true);
});
