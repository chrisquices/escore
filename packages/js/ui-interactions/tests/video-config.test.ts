import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createVideo, formatTime} from 'strata-packages/ui-interactions/video';
import {createFixture, createHost} from './helpers/video.ts';

test('video defaults describe live media properties without an initial delivery', function (t) {
    const f = createFixture(t);
    assert.deepEqual(f.events, []);
    assert.deepEqual(f.engine.getState(), {
        source: 'https://video.test/movie.mp4', sources: [{src: 'https://video.test/movie.mp4', type: ''}],
        paused: true, ended: false, playing: false, buffering: false, seeking: false, live: false,
        currentTime: 0, currentTimeFormatted: '0:00', duration: 120, durationFormatted: '2:00', bufferedRanges: [],
        remainingTime: 120, remainingTimeFormatted: '-2:00', volume: 1, volumeFormatted: '100%', muted: false,
        playbackRate: 1, loop: false, abLoopStart: 0, abLoopEnd: 0, abLoopStartFormatted: '0:00', abLoopEndFormatted: '0:00',
        abLoopReady: false, abLoopPhase: 'idle', autoplay: false, autoplayAttempted: false, autoplayBlocked: false,
        videoWidth: 1920, videoHeight: 1080, aspectRatio: 1920 / 1080,
        poster: '', captions: {enabled: false, src: '', language: '', label: '', tracks: []},
        fullscreen: false, fullscreenSupported: false, pictureInPicture: false, pictureInPictureSupported: false,
        keyboardShortcuts: true, touchGestures: true, persistSettings: false,
        watchProgress: {enabled: false, restored: false, savedTime: 0, savedTimeFormatted: '0:00', watchedPercent: 0},
    });
    const inherited = createFixture(t, {}, createHost({video: {loop: true}}));
    assert.equal(inherited.engine.getState().loop, true);
    const configured = createFixture(t, {loop: true, keyboardShortcuts: false});
    assert.equal(configured.video.loop, true);
    assert.equal(configured.engine.getState().keyboardShortcuts, false);
});

test('video validates media capabilities, config types, and numeric boundaries before setup', function () {
    for (const video of [null, {}, {addEventListener() {}, play() {}}, {addEventListener() {}, pause() {}}]) {
        assert.throws(() => createVideo(video), /createVideo: 'video' must be a media element/);
    }
    const invalid = [
        ['onChange', 1], ['onError', {}], ...['onSingleClick', 'onDoubleClick', 'onSingleTap', 'onDoubleTap'].map(key => [key, 1]), ['videoId', 12], ['playerContainer', {}],
        ...['autoplay', 'loop', 'keyboardShortcuts', 'autoplayMuted', 'touchGestures', 'watchProgress', 'persistSettings'].map(key => [key, 'true']),
        ...[0, -1, NaN, Infinity, '5'].map(value => ['keyboardSeekStep', value]),
        ...[0, -1, 1.1, NaN, Infinity, '0.1'].map(value => ['keyboardVolumeStep', value]),
        ...['poster', 'thumbnails'].flatMap(key => ['', 1, null].map(value => [key, value])),
        ...[0, -1, NaN, Infinity, '1'].map(value => ['thumbnailScale', value]),
        ...[-1, NaN, Infinity, '100'].map(value => ['watchProgressSaveInterval', value]),
    ];
    for (const [key, value] of invalid) {
        const host = createHost();
        assert.throws(() => createVideo(host.video, {[key]: value}), /createVideo:/, `${key}: ${value}`);
        assert.equal(host.video.registrations.length, 0);
    }
    for (const videoId of [undefined, '', ' ']) {
        assert.throws(() => createVideo(createHost().video, {watchProgress: true, videoId}), /non-empty string/);
    }
});

test('video validates source and metadata structures through constructor and setters', function (t) {
    const f = createFixture(t);
    for (const value of [null, {}, [null], ['song'], [{}], [{src: ''}], [{src: 1}], [{src: 'song', type: 1}]]) {
        assert.throws(() => createVideo(createHost().video, {sources: value}), /createVideo:/);
        assert.throws(() => f.engine.setSources(value), /createVideo:/);
    }
    const metadata = [false, [], 'title', ...['title', 'artist', 'album'].map(key => ({[key]: 1})),
        {artwork: {}}, {artwork: [null]}, {artwork: [[]]}, {artwork: [{}]}, {artwork: [{src: ''}]},
        {artwork: [{src: 'cover', sizes: 1}]}, {artwork: [{src: 'cover', type: 1}]}];
    for (const value of metadata) {
        assert.throws(() => createVideo(createHost().video, {mediaSession: value}), /createVideo:/);
        assert.throws(() => f.engine.setMediaSession(value), /createVideo:/);
    }
    assert.equal(f.engine.setMediaSession(null), true);
    assert.equal(f.engine.setMediaSession({title: '', artwork: [{src: 'cover', type: '', sizes: ''}]}), true);
});

test('video maps media errors to stable ids and isolates error consumers', async function (t) {
    const logged = t.mock.method(console, 'error', () => {});
    const f = createFixture(t, {onError() { throw new Error('consumer'); }});
    for (const [code, id] of [[1, 'loading-aborted'], [2, 'network-error'], [3, 'decode-error'], [4, 'unsupported-source'], [99, 'media-error']]) {
        f.video.error = {code};
        f.video.dispatch('error');
        assert.equal(f.errors.at(-1).id, id);
        assert.equal(f.errors.at(-1).metadata, null);
        assert.equal(typeof f.errors.at(-1).message, 'string');
    }
    f.video.error = null;
    f.video.dispatch('error');
    for (const [name, id] of [['NotAllowedError', 'playback-blocked'], ['Error', 'playback-failed']]) {
        f.video.playHook = () => Promise.reject({name});
        assert.equal(await f.engine.play(), false);
        assert.equal(f.errors.at(-1).id, id);
    }
    const count = f.errors.length;
    f.video.playHook = () => Promise.reject({name: 'AbortError'});
    assert.equal(await f.engine.play(), false);
    assert.equal(f.errors.length, count);
    assert.equal(logged.mock.callCount(), count);
});

test('video formatting, unknown duration, and live streams retain existing semantics', function (t) {
    for (const [input, expected] of [[0, '0:00'], [65.9, '1:05'], [3600, '60:00'], [-5, '0:00'], [NaN, '0:00'], [Infinity, '0:00']]) {
        assert.equal(formatTime(input), expected);
    }
    const f = createFixture(t, {}, createHost({video: {duration: Infinity, currentTime: 25}}));
    assert.equal(f.engine.getState().live, true);
    assert.equal(f.engine.getState().duration, 0);
    assert.equal(f.engine.getSeekTimeAtPercent(60), 25);
    assert.equal(f.engine.seekToPercent(90), false);
    f.video.duration = NaN;
    f.video.currentTime = NaN;
    assert.equal(f.engine.getState().currentTime, 0);
    assert.equal(f.engine.getState().remainingTime, 0);
});
