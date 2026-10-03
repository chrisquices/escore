import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAudioContext, createDeferred, createFixture, createHost, settle} from './helpers/audio.ts';

test('audio no-op setters and unchanged native events stay silent from construction onward', async function (t) {
    const f = createFixture(t);
    const received = [];
    f.engine.subscribe(state => received.push(state));
    f.engine.getState();
    for (const event of ['play', 'timeupdate', 'progress', 'durationchange', 'seeking', 'seeked', 'pause', 'ended', 'loadedmetadata', 'playing', 'canplay', 'volumechange', 'ratechange']) f.audio.dispatch(event);
    f.engine.pause(); f.engine.stop(); f.engine.seek(0); f.engine.setVolume(1); f.engine.setMuted(false);
    f.engine.setPlaybackRate(1); f.engine.setLoop(false); f.engine.setKeyboardShortcuts(true);
    f.engine.clearAbLoop(); f.engine.setAbLoopStart(0); await f.engine.setAutoplay(false);
    assert.deepEqual(f.events, []);
    assert.deepEqual(received, []);
    f.engine.seek(10);
    assert.equal(received.length, 1);
    assert.equal(received[0].currentTime, 10);
    for (const event of ['timeupdate', 'seeked', 'progress', 'loadedmetadata']) f.audio.dispatch(event);
    assert.equal(received.length, 1);
    f.engine.setVolume(0.5);
    f.audio.dispatch('volumechange');
    assert.equal(received.length, 2);
});

test('audio buffering events and browser-owned media fields deliver only actual changes', function (t) {
    const f = createFixture(t);
    for (const event of ['waiting', 'waiting', 'stalled']) f.audio.dispatch(event);
    assert.equal(f.events.length, 1);
    assert.equal(f.events[0].buffering, true);
    f.audio.dispatch('playing');
    f.audio.dispatch('canplay');
    assert.equal(f.events.length, 2);
    const changes = [
        ['paused', false, 'play'], ['ended', true, 'ended'], ['seeking', true, 'seeking'],
        ['currentTime', 18.25, 'timeupdate'], ['duration', 160, 'durationchange'],
        ['volume', 0.34, 'volumechange'], ['muted', true, 'volumechange'],
        ['playbackRate', 1.25, 'ratechange'], ['loop', true, 'progress'],
        ['currentSrc', 'https://audio.test/selected.mp3', 'loadedmetadata'],
    ];
    for (const [key, value, event] of changes) {
        const before = f.events.length;
        f.audio[key] = value;
        assert.equal(f.events.length, before);
        const fresh = f.engine.getState();
        f.audio.dispatch(event);
        assert.equal(f.events.length, before + 1, key);
        assert.deepEqual(f.events.at(-1), fresh);
        f.audio.dispatch(event);
        assert.equal(f.events.length, before + 1, key);
    }
    f.audio.setRanges([[0, 40], [80, 120]]);
    assert.deepEqual(f.engine.getState().bufferedRanges, [{startPercent: 0, endPercent: 25}, {startPercent: 50, endPercent: 75}]);
    f.audio.dispatch('progress');
    const count = f.events.length;
    f.audio.setRanges([[0, 40], [80, 120]]);
    f.audio.dispatch('progress');
    assert.equal(f.events.length, count);
    f.audio.setRanges([[0, 50]]);
    f.audio.dispatch('progress');
    assert.equal(f.events.length, count + 1);
});

test('audio observes native source nodes and capability changes without stale public caches', function (t) {
    const f = createFixture(t);
    const source = f.ownerDocument.createElement('source');
    source.src = 'alternative.ogg';
    source.type = 'audio/ogg';
    f.audio.appendChild(source);
    assert.equal(f.engine.getState().sources.length, 2);
    f.audio.dispatch('progress');
    assert.equal(f.events.length, 1);
    source.type = 'audio/custom';
    f.audio.dispatch('progress');
    assert.equal(f.events.at(-1).sources[1].type, 'audio/custom');
    source.remove();
    f.audio.dispatch('progress');
    assert.equal(f.events.at(-1).sources.length, 1);
    f.defaultView.AudioContext = function () {};
    f.defaultView.AudioWorkletNode = function () {};
    assert.equal(f.engine.getState().pitchShift.supported, true);
    f.audio.dispatch('progress');
    assert.equal(f.events.at(-1).pitchShift.supported, true);
});

test('audio notification delivery avoids JSON serialization when persistence is disabled', function (t) {
    const stringify = t.mock.method(JSON, 'stringify', () => { throw new Error('unexpected serialization'); });
    const f = createFixture(t);
    f.engine.seek(20);
    f.engine.setVolume(0.4);
    f.engine.setKeyboardShortcuts(false);
    f.engine.setAbLoopStart(10);
    f.engine.setAbLoopEnd(30);
    f.audio.dispatch('waiting');
    f.audio.dispatch('waiting');
    f.audio.dispatch('progress');
    assert.equal(f.events.length, 6);
    assert.equal(stringify.mock.callCount(), 0);
});

test('audio state readers and every listener own independent nested snapshots', function (t) {
    const f = createFixture(t, {}, createHost({ranges: [[0, 60]]}));
    const snapshots = [];
    f.engine.subscribe(state => {
        state.sources[0].src = 'poison'; state.sources.push({src: 'extra'});
        state.bufferedRanges[0].endPercent = -1; state.bufferedRanges.push({startPercent: -1, endPercent: -1});
        state.pitchShift.semitones = 99; state.watchProgress.savedTime = 99;
    });
    f.engine.subscribe(state => snapshots.push(state));
    f.engine.seek(20);
    const expected = f.engine.getState();
    assert.deepEqual(snapshots[0], expected);
    assert.deepEqual(f.events[0], expected);
    assert.notEqual(snapshots[0].sources, f.events[0].sources);
    assert.notEqual(snapshots[0].sources[0], f.events[0].sources[0]);
    expected.sources[0].src = 'read poison'; expected.bufferedRanges[0].endPercent = -10;
    expected.pitchShift.active = true; expected.watchProgress.restored = true;
    assert.deepEqual(f.engine.getState(), snapshots[0]);
});

test('audio stable subscriber wrappers preserve duplicate identity and unsubscribe semantics', function (t) {
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

test('audio isolates throwing consumers and supersedes stale outer delivery on reentrant changes', function (t) {
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
    assert.equal(f.audio.currentTime, 20);
});

test('audio subscriptions can change membership during synchronous delivery', function (t) {
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

test('audio silent configured and restored setup becomes the notification baseline', async function (t) {
    const cases = [
        {name: 'configured loop', config: {loop: true}, field: 'loop', initial: true, restored: false, setter: 'setLoop'},
        {name: 'restored loop', settings: {loop: true}, field: 'loop', initial: true, restored: false, setter: 'setLoop'},
        {name: 'restored volume', settings: {volume: 0.4}, field: 'volume', initial: 0.4, restored: 1, setter: 'setVolume'},
        {name: 'restored rate', settings: {playbackRate: 1.5}, field: 'playbackRate', initial: 1.5, restored: 1, setter: 'setPlaybackRate'},
    ];
    for (const item of cases) {
        for (const initialEcho of [false, true]) {
            await t.test(`${item.name}, initial echo ${initialEcho}`, function (t) {
                const host = createHost({storage: {'strata-audio-settings': JSON.stringify(item.settings || {})}});
                const f = createFixture(t, item.config || {persistSettings: true}, host);
                assert.deepEqual(f.events, []);
                assert.equal(f.engine.getState()[item.field], item.initial);
                if (initialEcho) {
                    for (const event of ['progress', 'volumechange', 'ratechange']) f.audio.dispatch(event);
                    assert.deepEqual(f.events, []);
                }
                f.engine[item.setter](item.restored);
                assert.equal(f.events.length, 1);
                assert.equal(f.events[0][item.field], item.restored);
                assert.deepEqual(f.events[0], f.engine.getState());
                for (const event of ['progress', 'volumechange', 'ratechange']) f.audio.dispatch(event);
                assert.equal(f.events.length, 1);
            });
        }
    }
});

test('audio initial autoplay completion retains the published attempt baseline', async function (t) {
    const f = createFixture(t, {autoplay: true});
    assert.equal(f.events.length, 1);
    assert.equal(f.events[0].autoplayAttempted, true);
    assert.equal(f.events[0].playing, false);
    assert.equal(f.engine.getState().playing, true);
    await settle();
    assert.equal(f.events.length, 2);
    assert.equal(f.events[1].playing, true);
    assert.deepEqual(f.events[1], f.engine.getState());
    for (const event of ['play', 'playing', 'progress']) f.audio.dispatch(event);
    assert.equal(f.events.length, 2);
});

test('audio silent restored pitch still notifies when its pending initialization completes', async function (t) {
    const ready = createDeferred();
    const host = createHost({storage: {'strata-audio-settings': JSON.stringify({pitchSemitones: 4})}});
    const webAudio = createAudioContext(t, host, {failWorklet: true, modulePromise: ready.promise});
    const f = createFixture(t, {pitchShift: true, persistSettings: true}, host);
    assert.deepEqual(f.events, []);
    assert.equal(f.engine.getState().pitchShift.semitones, 4);
    assert.equal(f.engine.getState().pitchShift.active, false);
    await settle();
    assert.deepEqual(f.events, []);
    webAudio.setWorkletFailure(false);
    ready.resolve();
    await settle();
    assert.equal(f.events.length, 1);
    assert.equal(f.events[0].pitchShift.semitones, 4);
    assert.equal(f.events[0].pitchShift.active, true);
    assert.deepEqual(f.events[0], f.engine.getState());
    f.audio.dispatch('progress');
    assert.equal(f.events.length, 1);
});
