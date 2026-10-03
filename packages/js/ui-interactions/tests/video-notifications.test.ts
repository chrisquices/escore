import assert from 'node:assert/strict';
import {test} from 'node:test';
import {applyPresentation, createFixture, createHost} from './helpers/video.ts';

test('video no-op setters and unchanged native events stay silent from construction onward', async function (t) {
    const f = createFixture(t);
    const received = [];
    f.engine.subscribe(state => received.push(state));
    f.engine.getState();
    for (const event of ['play', 'timeupdate', 'progress', 'durationchange', 'seeking', 'seeked', 'pause', 'ended', 'loadedmetadata', 'playing', 'canplay', 'volumechange', 'ratechange']) f.video.dispatch(event);
    f.engine.pause(); f.engine.stop(); f.engine.seek(0); f.engine.setVolume(1); f.engine.setMuted(false);
    f.engine.setPlaybackRate(1); f.engine.setLoop(false); f.engine.setKeyboardShortcuts(true);
    f.engine.clearAbLoop(); f.engine.setAbLoopStart(0); f.engine.setTouchGestures(true); await f.engine.setAutoplay(false);
    assert.deepEqual(f.events, []);
    assert.deepEqual(received, []);
    f.engine.seek(10);
    assert.equal(received.length, 1);
    assert.equal(received[0].currentTime, 10);
    for (const event of ['timeupdate', 'seeked', 'progress', 'loadedmetadata']) f.video.dispatch(event);
    assert.equal(received.length, 1);
    f.engine.setVolume(0.5);
    f.video.dispatch('volumechange');
    assert.equal(received.length, 2);
});

test('video buffering events and browser-owned media fields deliver only actual changes', function (t) {
    const f = createFixture(t);
    for (const event of ['waiting', 'waiting', 'stalled']) f.video.dispatch(event);
    assert.equal(f.events.length, 1);
    assert.equal(f.events[0].buffering, true);
    f.video.dispatch('playing');
    f.video.dispatch('canplay');
    assert.equal(f.events.length, 2);
    const changes = [
        ['paused', false, 'play'], ['ended', true, 'ended'], ['seeking', true, 'seeking'],
        ['currentTime', 18.25, 'timeupdate'], ['duration', 160, 'durationchange'],
        ['volume', 0.34, 'volumechange'], ['muted', true, 'volumechange'],
        ['playbackRate', 1.25, 'ratechange'], ['loop', true, 'progress'],
        ['currentSrc', 'https://video.test/selected.mp4', 'loadedmetadata'],
        ['videoWidth', 1280, 'loadedmetadata'], ['videoHeight', 720, 'loadedmetadata'], ['poster', 'cover.jpg', 'progress'],
    ];
    for (const [key, value, event] of changes) {
        const before = f.events.length;
        f.video[key] = value;
        assert.equal(f.events.length, before);
        const fresh = f.engine.getState();
        f.video.dispatch(event);
        assert.equal(f.events.length, before + 1, key);
        assert.deepEqual(f.events.at(-1), fresh);
        f.video.dispatch(event);
        assert.equal(f.events.length, before + 1, key);
    }
    f.video.setRanges([[0, 40], [80, 120]]);
    assert.deepEqual(f.engine.getState().bufferedRanges, [{startPercent: 0, endPercent: 25}, {startPercent: 50, endPercent: 75}]);
    f.video.dispatch('progress');
    const count = f.events.length;
    f.video.setRanges([[0, 40], [80, 120]]);
    f.video.dispatch('progress');
    assert.equal(f.events.length, count);
    f.video.setRanges([[0, 50]]);
    f.video.dispatch('progress');
    assert.equal(f.events.length, count + 1);
});

test('video observes native source nodes and capability changes without stale public caches', function (t) {
    const f = createFixture(t);
    const source = f.ownerDocument.createElement('source');
    source.src = 'alternative.ogg';
    source.type = 'video/ogg';
    f.video.appendChild(source);
    assert.equal(f.engine.getState().sources.length, 2);
    f.video.dispatch('progress');
    assert.equal(f.events.length, 1);
    source.type = 'video/custom';
    f.video.dispatch('progress');
    assert.equal(f.events.at(-1).sources[1].type, 'video/custom');
    source.remove();
    f.video.dispatch('progress');
    assert.equal(f.events.at(-1).sources.length, 1);
    applyPresentation(f);
    assert.equal(f.engine.getState().fullscreenSupported, true);
    assert.equal(f.engine.getState().pictureInPictureSupported, true);
    f.video.dispatch('progress');
    assert.equal(f.events.at(-1).fullscreenSupported, true);
    assert.equal(f.events.at(-1).pictureInPictureSupported, true);
});

test('video notification delivery avoids JSON serialization when persistence is disabled', function (t) {
    const stringify = t.mock.method(JSON, 'stringify', () => { throw new Error('unexpected serialization'); });
    const f = createFixture(t);
    f.engine.seek(20);
    f.engine.setVolume(0.4);
    f.engine.setKeyboardShortcuts(false);
    f.engine.setAbLoopStart(10);
    f.engine.setAbLoopEnd(30);
    f.video.dispatch('waiting');
    f.video.dispatch('waiting');
    f.video.dispatch('progress');
    assert.equal(f.events.length, 6);
    assert.equal(stringify.mock.callCount(), 0);
});

test('video state readers and every listener own independent nested snapshots', function (t) {
    const f = createFixture(t, {}, createHost({ranges: [[0, 60]]}));
    const snapshots = [];
    f.engine.subscribe(state => {
        state.sources[0].src = 'poison'; state.sources.push({src: 'extra'});
        state.bufferedRanges[0].endPercent = -1; state.bufferedRanges.push({startPercent: -1, endPercent: -1});
        state.captions.src = 'poison'; state.captions.tracks.push({src: 'poison'}); state.watchProgress.savedTime = 99;
    });
    f.engine.subscribe(state => snapshots.push(state));
    f.engine.seek(20);
    const expected = f.engine.getState();
    assert.deepEqual(snapshots[0], expected);
    assert.deepEqual(f.events[0], expected);
    assert.notEqual(snapshots[0].sources, f.events[0].sources);
    assert.notEqual(snapshots[0].sources[0], f.events[0].sources[0]);
    expected.sources[0].src = 'read poison'; expected.bufferedRanges[0].endPercent = -10;
    expected.captions.enabled = true; expected.watchProgress.restored = true;
    assert.deepEqual(f.engine.getState(), snapshots[0]);
});

test('video stable subscriber wrappers preserve duplicate identity and unsubscribe semantics', function (t) {
    const f = createFixture(t);
    const received = [];
    const listener = state => received.push(state.currentTime);
    const first = f.engine.subscribe(listener);
    const second = f.engine.subscribe(listener);
    f.engine.seek(10);
    assert.deepEqual(received, [10]);
    first(); first();
    f.engine.seek(20);
    assert.deepEqual(received, [10]);
    f.engine.subscribe(listener);
    f.engine.seek(30);
    second();
    f.engine.seek(40);
    assert.deepEqual(received, [10, 30]);
    for (const invalid of [null, {}, 1]) assert.throws(() => f.engine.subscribe(invalid), /listener/);
});

test('video isolates throwing consumers and supersedes stale outer delivery on reentrant changes', function (t) {
    const logged = t.mock.method(console, 'error', () => {});
    const f = createFixture(t, {onChange() { throw new Error('onChange'); }});
    const received = [];
    f.engine.subscribe(() => { throw new Error('subscriber'); });
    f.engine.subscribe(state => { if (state.currentTime === 10) f.engine.seek(20); });
    f.engine.subscribe(state => received.push(state.currentTime));
    f.engine.seek(10);
    assert.deepEqual(f.events.map(state => state.currentTime), [10, 20]);
    assert.deepEqual(received, [20]);
    assert.equal(logged.mock.callCount(), 4);
    assert.equal(f.video.currentTime, 20);
});

test('video subscriptions can change membership during synchronous delivery', function (t) {
    const f = createFixture(t);
    const calls = [];
    let removeSecond;
    f.engine.subscribe(() => { removeSecond(); f.engine.subscribe(third); });
    removeSecond = f.engine.subscribe(() => calls.push('second'));
    function third() { calls.push('third'); }
    f.engine.seek(10);
    assert.deepEqual(calls, ['third']);
    f.engine.seek(20);
    assert.deepEqual(calls, ['third', 'third']);
});

test('video silent configured and restored setup becomes the notification baseline', function (t) {
    for (const mode of ['configured', 'restored']) {
        const host = createHost({storage: {'strata-settings': JSON.stringify({loop: true, volume: 0.4, playbackRate: 1.5})}});
        const f = createFixture(t, mode === 'configured' ? {loop: true, poster: 'cover.jpg'} : {persistSettings: true}, host);
        assert.deepEqual(f.events, []);
        f.video.dispatch('progress');
        assert.deepEqual(f.events, []);
        f.engine.setLoop(false);
        assert.equal(f.events.length, 1);
        assert.equal(f.events[0].loop, false);
        f.video.dispatch('progress');
        assert.equal(f.events.length, 1);
        if (mode === 'restored') {
            f.engine.setVolume(1);
            f.engine.setPlaybackRate(1);
            assert.equal(f.events.length, 3);
        }
    }
});
