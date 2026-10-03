import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture, createHost} from './helpers/video.ts';

const settingsKey = 'strata-settings';
const progressKey = 'video-watch-progress:episode';

test('video restores global preferences after source load and saves only explicit preferences', function (t) {
    const host = createHost({storage: {[settingsKey]: JSON.stringify({volume: 0.4, muted: true, playbackRate: 1.75, loop: true})}});
    const f = createFixture(t, {persistSettings: true, sources: [{src: 'episode.mp3'}]}, host);
    assert.equal(f.video.loadCalls, 1);
    assert.equal(f.video.volume, 0.4);
    assert.equal(f.video.muted, true);
    assert.equal(f.video.playbackRate, 1.75);
    assert.equal(f.video.loop, true);
    assert.deepEqual(f.storage.writes, []);
    f.video.volume = 0.2;
    f.video.dispatch('volumechange');
    f.video.playbackRate = 1;
    f.video.dispatch('ratechange');
    assert.deepEqual(f.storage.writes, []);
    f.engine.setPlaybackRate(1.5);
    assert.deepEqual(JSON.parse(f.storage.values.get(settingsKey)), {volume: 0.2, muted: true, playbackRate: 1.5, loop: true, autoplay: false, selectedCaption: null});
    const count = f.storage.writes.length;
    f.engine.setPlaybackRate(1.5);
    f.engine.setMuted(true);
    f.engine.setLoop(true);
    assert.equal(f.storage.writes.length, count);
    f.engine.setVolume(0.5);
    f.engine.toggleMuted();
    f.engine.toggleLoop();
    assert.equal(f.storage.writes.length, count + 3);
    const state = f.engine.getState();
    assert.equal(f.engine.clearPersistedSettings(), true);
    assert.equal(f.storage.values.has(settingsKey), false);
    assert.deepEqual(f.engine.getState(), state);
});

test('video ignores corrupt and out-of-range persisted settings and tolerates storage failures', function (t) {
    for (const stored of ['{', 'null', 'true', '1', JSON.stringify({volume: 2, muted: 'yes', playbackRate: 4, loop: 'yes'})]) {
        const f = createFixture(t, {persistSettings: true}, createHost({storage: {[settingsKey]: stored}}));
        assert.equal(f.video.volume, 1);
        assert.equal(f.video.muted, false);
        assert.equal(f.video.playbackRate, 1);
        assert.equal(f.video.loop, false);
    }
    const f = createFixture(t, {persistSettings: true});
    f.storage.failSet = true;
    assert.equal(f.engine.setVolume(0.3), true);
    assert.equal(f.engine.getState().volume, 0.3);
    f.storage.failRemove = true;
    assert.equal(f.engine.clearPersistedSettings(), false);
    const denied = createHost();
    Object.defineProperty(denied.defaultView, 'localStorage', {get() { throw new Error('denied'); }});
    const inaccessible = createFixture(t, {persistSettings: true, watchProgress: true, videoId: 'episode'}, denied);
    assert.equal(inaccessible.engine.setMuted(true), true);
    assert.equal(inaccessible.engine.clearPersistedSettings(), false);
    assert.equal(inaccessible.engine.resumeWatchProgress(), false);
    const noStorage = createHost();
    noStorage.storage.failGet = true;
    createFixture(t, {persistSettings: true}, noStorage);
    assert.equal(createFixture(t).engine.clearPersistedSettings(), false);
});

test('video watch progress throttles time updates and force-saves seek, pause, end and teardown', function (t) {
    let now = 10000;
    t.mock.method(Date, 'now', () => now);
    const f = createFixture(t, {watchProgress: true, videoId: 'episode', watchProgressSaveInterval: 1000});
    f.video.currentTime = 12;
    f.video.dispatch('timeupdate');
    assert.deepEqual(JSON.parse(f.storage.values.get(progressKey)), {currentTime: 12, duration: 120, watchedPercent: 10, source: f.video.src, ended: false, updatedAt: 10000});
    now += 500;
    f.video.currentTime = 24;
    f.video.dispatch('timeupdate');
    assert.equal(f.storage.writes.length, 1);
    assert.equal(f.engine.getState().watchProgress.savedTime, 12);
    assert.equal(f.engine.getState().watchProgress.watchedPercent, 20);
    now += 500;
    f.video.dispatch('timeupdate');
    assert.equal(f.storage.writes.length, 2);
    for (const event of ['seeked', 'pause', 'ended']) {
        f.video.currentTime += 1;
        f.video.dispatch(event);
    }
    assert.equal(f.storage.writes.length, 5);
    f.video.ended = true;
    f.engine.destroy();
    assert.equal(f.storage.writes.length, 6);
    assert.equal(JSON.parse(f.storage.values.get(progressKey)).ended, true);
    f.engine.destroy();
    assert.equal(f.storage.writes.length, 6);
});

test('video watch progress refuses empty media and survives read and write failures', function (t) {
    const f = createFixture(t, {watchProgress: true, videoId: 'episode', watchProgressSaveInterval: 0});
    for (const patch of [{src: '', currentSrc: ''}, {src: 'song', duration: 0}, {duration: Infinity}]) {
        Object.assign(f.video, patch);
        f.video.dispatch('pause');
    }
    assert.deepEqual(f.storage.writes, []);
    f.video.duration = 120;
    f.storage.failSet = true;
    f.video.currentTime = 40;
    f.video.dispatch('seeked');
    assert.equal(f.engine.getState().watchProgress.savedTime, 0);
    f.storage.failSet = false;
    f.video.dispatch('seeked');
    assert.equal(f.engine.getState().watchProgress.savedTime, 40);
    f.storage.failGet = true;
    assert.equal(f.engine.getState().watchProgress.savedTime, 0);
    assert.equal(f.engine.resumeWatchProgress(), false);
});

test('video resumes saved progress once, without automatic restoration or persistence on reads', function (t) {
    const f = createFixture(t, {watchProgress: true, videoId: 'episode'}, createHost({storage: {[progressKey]: JSON.stringify({currentTime: '35', source: 'https://video.test/movie.mp4'})}}));
    assert.equal(f.video.currentTime, 0);
    assert.equal(f.engine.getState().watchProgress.savedTime, 35);
    assert.equal(f.engine.resumeWatchProgress(), true);
    assert.equal(f.video.currentTime, 35);
    assert.equal(f.events.at(-1).watchProgress.restored, true);
    assert.equal(f.engine.resumeWatchProgress(), false);
    assert.deepEqual(f.storage.writes, []);
    f.engine.load();
    assert.equal(f.engine.resumeWatchProgress(), true);
    assert.equal(f.video.currentTime, 35);
});

test('video rejected and already-positioned restores still notify the published restored flag exactly once', function (t) {
    const records = [undefined, '{', 'null', '4', JSON.stringify({ended: true, currentTime: 20}),
        JSON.stringify({source: 'another.mp3', currentTime: 20}), ...[0, -1, 'bad', 118, 130].map(currentTime => JSON.stringify({currentTime}))];
    for (const record of records) {
        const storage = record === undefined ? {} : {[progressKey]: record};
        const f = createFixture(t, {watchProgress: true, videoId: 'episode'}, createHost({storage}));
        assert.equal(f.engine.resumeWatchProgress(), false);
        assert.equal(f.engine.getState().watchProgress.restored, true);
        assert.equal(f.events.length, 1);
        assert.equal(f.events[0].watchProgress.restored, true);
        f.engine.resumeWatchProgress();
        assert.equal(f.events.length, 1);
    }
    const same = createFixture(t, {watchProgress: true, videoId: 'episode'}, createHost({video: {currentTime: 30}, storage: {[progressKey]: JSON.stringify({currentTime: 30})}}));
    assert.equal(same.engine.resumeWatchProgress(), false);
    assert.equal(same.events.length, 1);
    assert.equal(same.events[0].watchProgress.restored, true);
    const disabled = createFixture(t);
    assert.equal(disabled.engine.resumeWatchProgress(), false);
    assert.equal(disabled.engine.getState().watchProgress.restored, false);
});

test('video progress snapshots observe external saved time changes and normalize malformed times', function (t) {
    const f = createFixture(t, {watchProgress: true, videoId: 'episode'});
    for (const [value, expected] of [['{', 0], ['null', 0], ['true', 0], [JSON.stringify({currentTime: -1}), 0], [JSON.stringify({currentTime: '20'}), 20]]) {
        f.storage.values.set(progressKey, value);
        assert.equal(f.engine.getState().watchProgress.savedTime, expected);
    }
    f.video.dispatch('progress');
    assert.equal(f.events.at(-1).watchProgress.savedTime, 20);
    f.storage.values.set(progressKey, JSON.stringify({currentTime: 45}));
    assert.equal(f.engine.getState().watchProgress.savedTime, 45);
    f.video.dispatch('progress');
    assert.equal(f.events.at(-1).watchProgress.savedTime, 45);
});
