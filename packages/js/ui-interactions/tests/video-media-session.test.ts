import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture, createHost, settle} from './helpers/video.ts';

test('video media session installs metadata and syncs playback and position before consumer delivery', async function (t) {
    for (const metadataConstructor of [false, true]) {
        const host = createHost({mediaSession: true, metadataConstructor});
        const observed = [];
        const metadata = {title: 'Episode', artist: 'Artist', album: 'Album', artwork: [{src: 'cover.png', sizes: '64x64', type: 'image/png'}]};
        const f = createFixture(t, {mediaSession: metadata, onChange(state) {
            observed.push({time: state.currentTime, playing: state.playing, playbackState: host.mediaSession.playbackState, position: host.mediaSession.positions.at(-1)});
        }}, host);
        assert.deepEqual({...f.mediaSession.metadata}, metadata);
        assert.equal(f.mediaSession.playbackState, 'paused');
        assert.deepEqual(f.mediaSession.positions.at(-1), {duration: 120, playbackRate: 1, position: 0});
        assert.equal(f.events.length, 0);
        f.engine.seek(30);
        assert.deepEqual(observed.at(-1), {time: 30, playing: false, playbackState: 'paused', position: {duration: 120, playbackRate: 1, position: 30}});
        await f.engine.play();
        assert.equal(observed.at(-1).playbackState, 'playing');
        assert.equal(f.engine.setMediaSession({title: 'Updated'}), true);
        assert.equal(f.mediaSession.metadata.title, 'Updated');
        assert.deepEqual(f.mediaSession.metadata.artwork, []);
        assert.equal(f.engine.setMediaSession(null), true);
        assert.equal(f.mediaSession.metadata, null);
        assert.equal(f.mediaSession.playbackState, 'none');
        assert.ok([...f.mediaSession.handlers.values()].every(handler => handler === null));
    }
});

test('video media session actions dispatch existing playback and seek controls', async function (t) {
    const f = createFixture(t, {mediaSession: {}}, createHost({mediaSession: true}));
    const handlers = f.mediaSession.handlers;
    assert.deepEqual([...handlers.keys()], ['play', 'pause', 'stop', 'seekbackward', 'seekforward', 'seekto']);
    handlers.get('play')({});
    await settle();
    assert.equal(f.video.paused, false);
    handlers.get('pause')({});
    assert.equal(f.video.paused, true);
    f.engine.seek(50);
    handlers.get('seekbackward')({seekOffset: 7});
    assert.equal(f.video.currentTime, 43);
    handlers.get('seekforward')({});
    assert.equal(f.video.currentTime, 53);
    handlers.get('seekbackward')({});
    assert.equal(f.video.currentTime, 43);
    handlers.get('seekforward')({seekOffset: 7});
    assert.equal(f.video.currentTime, 50);
    handlers.get('seekto')({seekTime: 90});
    assert.equal(f.video.currentTime, 90);
    handlers.get('seekto')({seekTime: 25, fastSeek: true});
    assert.deepEqual(f.video.fastSeeks, [25]);
    assert.equal(f.events.at(-1).currentTime, 25);
    for (const details of [null, {}, {seekTime: NaN}, {seekTime: Infinity}]) handlers.get('seekto')(details);
    assert.equal(f.video.currentTime, 25);
    f.video.fastSeek = undefined;
    handlers.get('seekto')({seekTime: 35, fastSeek: true});
    assert.equal(f.video.currentTime, 35);
    handlers.get('stop')({});
    assert.equal(f.video.currentTime, 0);
    assert.equal(f.video.paused, true);
});

test('video media session skips unsupported or disabled integration and invalid duration positions', function (t) {
    const disabled = createFixture(t, {}, createHost({mediaSession: true}));
    assert.equal(disabled.mediaSession.actions.length, 0);
    assert.equal(disabled.mediaSession.positions.length, 0);
    const unsupported = createFixture(t, {mediaSession: {title: 'Title'}});
    assert.equal(unsupported.engine.setMediaSession({}), true);
    const f = createFixture(t, {mediaSession: {}}, createHost({mediaSession: true}));
    const count = f.mediaSession.positions.length;
    for (const duration of [Infinity, NaN, 0]) {
        f.video.duration = duration;
        f.video.dispatch('durationchange');
    }
    assert.equal(f.mediaSession.positions.length, count);
    f.video.duration = 50;
    f.video.currentTime = 80;
    f.video.dispatch('durationchange');
    assert.equal(f.mediaSession.positions.at(-1).position, 50);
    f.mediaSession.setPositionState = undefined;
    f.engine.seek(10);
});

test('video tolerates metadata, action and position API failures and still cleans up', function (t) {
    const host = createHost({mediaSession: true});
    const calls = [];
    Object.defineProperty(host.mediaSession, 'metadata', {set() { throw new Error('metadata'); }});
    Object.defineProperty(host.mediaSession, 'playbackState', {set() { throw new Error('playback state'); }});
    host.mediaSession.setPositionState = () => { throw new Error('position'); };
    host.mediaSession.setActionHandler = (action, handler) => { calls.push({action, handler}); throw new Error('action'); };
    const f = createFixture(t, {mediaSession: {}}, host);
    assert.equal(calls.length, 6);
    assert.equal(f.engine.seek(10), true);
    f.engine.destroy();
    assert.equal(calls.length, 12);
    assert.ok(calls.slice(6).every(call => call.handler === null));
    const minimal = createHost({mediaSession: true});
    minimal.mediaSession.setActionHandler = undefined;
    minimal.mediaSession.setPositionState = undefined;
    createFixture(t, {mediaSession: {}}, minimal).engine.destroy();
});
