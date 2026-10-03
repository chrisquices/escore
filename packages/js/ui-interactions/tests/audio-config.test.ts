import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAudio, formatTime} from 'strata-packages/ui-interactions/audio';
import {createFixture, createHost} from './helpers/audio.ts';

test('audio defaults describe live media properties without an initial delivery', function (t) {
    const f = createFixture(t);
    assert.deepEqual(f.events, []);
    assert.deepEqual(f.engine.getState(), {
        source: 'https://audio.test/song.mp3', sources: [{src: 'https://audio.test/song.mp3', type: ''}],
        paused: true, ended: false, playing: false, buffering: false, seeking: false, live: false,
        currentTime: 0, currentTimeFormatted: '0:00', duration: 120, durationFormatted: '2:00', bufferedRanges: [],
        remainingTime: 120, remainingTimeFormatted: '-2:00', volume: 1, volumeFormatted: '100%', muted: false,
        playbackRate: 1, loop: false, abLoopStart: 0, abLoopEnd: 0, abLoopStartFormatted: '0:00', abLoopEndFormatted: '0:00',
        abLoopReady: false, abLoopPhase: 'idle', autoplay: false, autoplayAttempted: false, autoplayBlocked: false,
        keyboardShortcuts: true, persistSettings: false,
        pitchShift: {supported: false, enabled: false, active: false, semitones: 0},
        watchProgress: {enabled: false, restored: false, savedTime: 0, savedTimeFormatted: '0:00', watchedPercent: 0},
    });
    const inherited = createFixture(t, {}, createHost({audio: {loop: true}}));
    assert.equal(inherited.engine.getState().loop, true);
    const configured = createFixture(t, {loop: true, keyboardShortcuts: false});
    assert.equal(configured.audio.loop, true);
    assert.equal(configured.engine.getState().keyboardShortcuts, false);
});

test('audio validates media capabilities, config types, and numeric boundaries before setup', function () {
    for (const audio of [null, {}, {addEventListener() {}, play() {}}, {addEventListener() {}, pause() {}}]) {
        assert.throws(() => createAudio(audio), /createAudio: 'audio' must be a media element/);
    }
    const invalid = [
        ['onChange', 1], ['onError', {}], ['audioId', 12], ['playerContainer', {}],
        ...['autoplay', 'loop', 'keyboardShortcuts', 'pitchShift', 'watchProgress', 'persistSettings'].map(key => [key, 'true']),
        ...[0, -1, NaN, Infinity, '5'].map(value => ['keyboardSeekStep', value]),
        ...[0, -1, 1.1, NaN, Infinity, '0.1'].map(value => ['keyboardVolumeStep', value]),
        ...[-1, NaN, Infinity, '100'].map(value => ['watchProgressSaveInterval', value]),
    ];
    for (const [key, value] of invalid) {
        const host = createHost();
        assert.throws(() => createAudio(host.audio, {[key]: value}), /createAudio:/, `${key}: ${value}`);
        assert.equal(host.audio.registrations.length, 0);
    }
    for (const audioId of [undefined, '', ' ']) {
        assert.throws(() => createAudio(createHost().audio, {watchProgress: true, audioId}), /non-empty string/);
    }
});

test('audio validates source and metadata structures through constructor and setters', function (t) {
    const f = createFixture(t);
    for (const value of [null, {}, [null], ['song'], [{}], [{src: ''}], [{src: 1}], [{src: 'song', type: 1}]]) {
        assert.throws(() => createAudio(createHost().audio, {sources: value}), /createAudio:/);
        assert.throws(() => f.engine.setSources(value), /createAudio:/);
    }
    const metadata = [false, [], 'title', ...['title', 'artist', 'album'].map(key => ({[key]: 1})),
        {artwork: {}}, {artwork: [null]}, {artwork: [[]]}, {artwork: [{}]}, {artwork: [{src: ''}]},
        {artwork: [{src: 'cover', sizes: 1}]}, {artwork: [{src: 'cover', type: 1}]}];
    for (const value of metadata) {
        assert.throws(() => createAudio(createHost().audio, {mediaSession: value}), /createAudio:/);
        assert.throws(() => f.engine.setMediaSession(value), /createAudio:/);
    }
    assert.equal(f.engine.setMediaSession(null), true);
    assert.equal(f.engine.setMediaSession({title: '', artwork: [{src: 'cover', type: '', sizes: ''}]}), true);
});

test('audio maps media errors to stable ids and isolates error consumers', async function (t) {
    const logged = t.mock.method(console, 'error', () => {});
    const f = createFixture(t, {onError() { throw new Error('consumer'); }});
    for (const [code, id] of [[1, 'loading-aborted'], [2, 'network-error'], [3, 'decode-error'], [4, 'unsupported-source'], [99, 'media-error']]) {
        f.audio.error = {code};
        f.audio.dispatch('error');
        assert.equal(f.errors.at(-1).id, id);
        assert.equal(f.errors.at(-1).metadata, null);
        assert.equal(typeof f.errors.at(-1).message, 'string');
    }
    f.audio.error = null;
    f.audio.dispatch('error');
    for (const [name, id] of [['NotAllowedError', 'playback-blocked'], ['Error', 'playback-failed']]) {
        f.audio.playHook = () => Promise.reject({name});
        assert.equal(await f.engine.play(), false);
        assert.equal(f.errors.at(-1).id, id);
    }
    const count = f.errors.length;
    f.audio.playHook = () => Promise.reject({name: 'AbortError'});
    assert.equal(await f.engine.play(), false);
    assert.equal(f.errors.length, count);
    assert.equal(logged.mock.callCount(), count);
});

test('audio formatting, unknown duration, and live streams retain existing semantics', function (t) {
    for (const [input, expected] of [[0, '0:00'], [65.9, '1:05'], [3600, '60:00'], [-5, '0:00'], [NaN, '0:00'], [Infinity, '0:00']]) {
        assert.equal(formatTime(input), expected);
    }
    const f = createFixture(t, {}, createHost({audio: {duration: Infinity, currentTime: 25}}));
    assert.equal(f.engine.getState().live, true);
    assert.equal(f.engine.getState().duration, 0);
    assert.equal(f.engine.getSeekTimeAtPercent(60), 25);
    assert.equal(f.engine.seekToPercent(90), false);
    f.audio.duration = NaN;
    f.audio.currentTime = NaN;
    assert.equal(f.engine.getState().currentTime, 0);
    assert.equal(f.engine.getState().remainingTime, 0);
});
