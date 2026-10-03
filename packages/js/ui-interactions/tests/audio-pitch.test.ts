import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAudioContext, createDeferred, createFixture, createHost, settle} from './helpers/audio.ts';

test('audio pitch stays native while disabled or zero and reports missing browser support', async function (t) {
    const host = createHost();
    const webAudio = createAudioContext(t, host);
    const disabled = createFixture(t, {}, host);
    assert.equal(await disabled.engine.setPitch(3), false);
    assert.deepEqual(webAudio.contexts, []);
    const unsupported = createFixture(t, {pitchShift: true});
    assert.equal(await unsupported.engine.setPitch(2), false);
    assert.equal(unsupported.errors[0].id, 'pitch-shift-unavailable');
    const enabled = createFixture(t, {pitchShift: true}, host);
    assert.equal(enabled.audio.preservesPitch, true);
    assert.equal(enabled.audio.webkitPreservesPitch, true);
    assert.equal(enabled.audio.mozPreservesPitch, true);
    assert.equal(await enabled.engine.setPitch(0), true);
    assert.deepEqual(webAudio.contexts, []);
    for (const value of [NaN, Infinity, 'bad']) await assert.rejects(enabled.engine.setPitch(value), /finite number/);
});

test('audio pitch lazily taps once, clamps shifts, shares builds and keeps playback rate independent', async function (t) {
    const host = createHost();
    const webAudio = createAudioContext(t, host);
    const f = createFixture(t, {pitchShift: true}, host);
    f.engine.setPlaybackRate(1.5);
    const first = f.engine.setPitch(3);
    const second = f.engine.setPitch(6);
    assert.deepEqual(await Promise.all([first, second]), [true, true]);
    assert.equal(webAudio.contexts.length, 1);
    assert.equal(webAudio.contexts[0].taps, 1);
    assert.equal(webAudio.nodes.length, 1);
    assert.equal(f.engine.getState().pitchShift.semitones, 6);
    assert.equal(f.engine.getState().pitchShift.active, true);
    assert.equal(f.audio.playbackRate, 1.5);
    assert.equal(webAudio.contexts[0].resumes, 1);
    assert.deepEqual(webAudio.contexts[0].source.connections, [webAudio.nodes[0]]);
    assert.deepEqual(webAudio.nodes[0].connections, [webAudio.contexts[0].destination]);
    const count = f.events.length;
    assert.equal(await f.engine.setPitch(6), true);
    assert.equal(f.events.length, count);
    assert.equal(await f.engine.setPitch(99), true);
    assert.equal(f.engine.getState().pitchShift.semitones, 12);
    assert.equal(await f.engine.setPitch(-99), true);
    assert.equal(f.engine.getState().pitchShift.semitones, -12);
    assert.equal(await f.engine.setPitch(0), true);
    assert.equal(f.engine.getState().pitchShift.active, false);
    assert.equal(webAudio.contexts[0].taps, 1);
    assert.ok(webAudio.nodes[0].schedules.length >= 4);
});

test('audio pitch protects cross-origin media before tapping while accepting CORS and data sources', async function (t) {
    const host = createHost({audio: {src: 'https://elsewhere.test/song.mp3'}});
    const webAudio = createAudioContext(t, host);
    const f = createFixture(t, {pitchShift: true}, host);
    assert.equal(await f.engine.setPitch(2), false);
    assert.equal(f.errors.at(-1).id, 'pitch-shift-cross-origin');
    assert.equal(f.engine.getState().pitchShift.semitones, 0);
    assert.equal(webAudio.contexts[0].taps, 0);
    assert.deepEqual(f.events, []);
    f.audio.crossOrigin = 'anonymous';
    assert.equal(await f.engine.setPitch(2), true);
    assert.equal(webAudio.contexts[0].taps, 1);
    const dataHost = createHost({audio: {src: 'data:audio/mpeg;base64,AAAA'}});
    const dataAudio = createAudioContext(t, dataHost, {webkit: true});
    const data = createFixture(t, {pitchShift: true}, dataHost);
    assert.equal(await data.engine.setPitch(-2), true);
    assert.equal(dataAudio.contexts[0].taps, 1);
});

test('audio pitch context and source-tap failures reset requested shift without a false state change', async function (t) {
    for (const [options, id] of [[{failConstructor: true}, 'pitch-shift-unavailable'], [{failTap: true}, 'pitch-shift-source-tap-failed']]) {
        const host = createHost();
        createAudioContext(t, host, options);
        const f = createFixture(t, {pitchShift: true}, host);
        assert.equal(await f.engine.setPitch(5), false);
        assert.equal(f.errors.at(-1).id, id);
        assert.deepEqual(f.engine.getState().pitchShift, {supported: true, enabled: true, active: false, semitones: 0});
        assert.deepEqual(f.events, []);
    }
});

test('audio failed worklet builds keep an audible fallback and successful retry replaces the dry route', async function (t) {
    const host = createHost();
    const webAudio = createAudioContext(t, host, {failWorklet: true});
    const f = createFixture(t, {pitchShift: true}, host);
    assert.equal(await f.engine.setPitch(3), false);
    assert.equal(f.errors.at(-1).id, 'pitch-shift-worklet-failed');
    const context = webAudio.contexts[0];
    assert.deepEqual(context.source.connections, [context.destination]);
    assert.equal(f.engine.getState().pitchShift.semitones, 0);
    webAudio.setWorkletFailure(false);
    assert.equal(await f.engine.setPitch(4), true);
    assert.equal(context.taps, 1);
    assert.deepEqual(context.source.connections, [webAudio.nodes[0]]);
    assert.equal(context.source.disconnects, 1);
    assert.equal(f.engine.getState().pitchShift.active, true);
});

test('audio pitch restores saved settings and resumes suspended contexts on play gestures', async function (t) {
    const host = createHost({storage: {'strata-audio-settings': JSON.stringify({pitchSemitones: 4, volume: 0.6, playbackRate: 1.25})}});
    const webAudio = createAudioContext(t, host, {failResume: true});
    const f = createFixture(t, {pitchShift: true, persistSettings: true}, host);
    await settle();
    assert.equal(f.engine.getState().pitchShift.semitones, 4);
    assert.equal(f.engine.getState().pitchShift.active, true);
    assert.equal(f.audio.volume, 0.6);
    assert.equal(f.audio.playbackRate, 1.25);
    assert.equal(JSON.parse(f.storage.values.get('strata-audio-settings')).pitchSemitones, 4);
    const context = webAudio.contexts[0];
    assert.equal(context.resumes, 1);
    f.audio.dispatch('play');
    await settle();
    assert.equal(context.resumes, 2);
    await f.engine.setPitch(0);
    assert.equal(context.resumes, 3);
    f.engine.setSources([{src: 'next.mp3'}]);
    assert.equal(f.audio.preservesPitch, true);
    assert.equal(f.audio.playbackRate, 1.25);
});

test('audio pitch zero during a pending build wins without duplicate or net-unchanged notifications', async function (t) {
    const host = createHost();
    const webAudio = createAudioContext(t, host);
    const f = createFixture(t, {pitchShift: true}, host);
    const pending = f.engine.setPitch(4);
    assert.equal(await f.engine.setPitch(0), true);
    assert.equal(await pending, true);
    assert.equal(f.engine.getState().pitchShift.semitones, 0);
    assert.equal(f.engine.getState().pitchShift.active, false);
    assert.deepEqual(f.events, []);
    assert.equal(webAudio.contexts[0].taps, 1);
});

test('audio pitch tears down graphs once and releases nodes whose readiness arrives after destruction', async function (t) {
    for (const waitUntilReady of [false, true]) {
        const host = createHost();
        const webAudio = createAudioContext(t, host);
        const f = createFixture(t, {pitchShift: true}, host);
        const pending = f.engine.setPitch(4);
        if (waitUntilReady) assert.equal(await pending, true);
        const count = f.events.length;
        f.engine.destroy();
        assert.equal(await pending, waitUntilReady);
        assert.equal(webAudio.contexts[0].closes, 1);
        assert.equal(webAudio.contexts[0].source.connections.length, 0);
        assert.equal(webAudio.nodes[0].disconnects, 1);
        assert.equal(webAudio.nodes[0].connections.length, 0);
        assert.equal(f.engine.getState().pitchShift.active, false);
        assert.equal(f.events.length, count);
        f.engine.destroy();
        assert.equal(webAudio.contexts[0].closes, 1);
        assert.equal(webAudio.nodes[0].disconnects, 1);
    }
});

test('audio destroyed pending worklet registration suppresses late failures', async function (t) {
    const registration = createDeferred();
    const host = createHost();
    const webAudio = createAudioContext(t, host, {failWorklet: true, modulePromise: registration.promise});
    const f = createFixture(t, {pitchShift: true}, host);
    const pending = f.engine.setPitch(4);
    await settle();
    f.engine.destroy();
    registration.reject(new Error('late module failure'));
    assert.equal(await pending, false);
    assert.deepEqual(f.errors, []);
    assert.deepEqual(f.events, []);
    assert.equal(webAudio.contexts[0].closes, 1);
});

test('audio pitch error-consumer retry retains ownership of its newer graph and requested shift', async function (t) {
    const host = createHost({audio: {src: 'https://elsewhere.test/song.mp3'}});
    const webAudio = createAudioContext(t, host);
    let retry;
    const f = createFixture(t, {pitchShift: true, onError(error) {
        if (error.id !== 'pitch-shift-cross-origin') return;
        host.audio.crossOrigin = 'anonymous';
        retry = f.engine.setPitch(4);
    }}, host);
    assert.equal(await f.engine.setPitch(3), false);
    assert.equal(await retry, true);
    assert.equal(f.engine.getState().pitchShift.semitones, 4);
    assert.equal(f.engine.getState().pitchShift.active, true);
    assert.equal(webAudio.contexts[0].taps, 1);
    assert.equal(f.events.length, 1);
});
