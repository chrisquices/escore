import assert from 'node:assert/strict';
import {test} from 'node:test';
import {applyPresentation, createClock, createFixture, createHost, settle} from './helpers/video.ts';

test('video mouse clicks toggle immediately and a double-click restores playback before fullscreen', async function (t) {
    const clock = createClock(t);
    const host = createHost();
    const calls = applyPresentation(host);
    const f = createFixture(t, {playerContainer: host.container}, host);
    f.container.dispatch('pointerup', {pointerType: 'mouse', clientX: 160});
    assert.equal(f.video.paused, false);
    assert.equal(clock.timers.size, 0);
    await settle();
    clock.setTime(1200);
    f.container.dispatch('pointerup', {pointerType: 'mouse', clientX: 160});
    await settle();
    assert.equal(f.video.paused, true);
    assert.deepEqual(calls, ['enter-fullscreen']);
    clock.setTime(1600);
    f.container.dispatch('pointerup', {pointerType: 'mouse', clientX: 160});
    assert.equal(f.video.paused, false);
    await settle();
    clock.setTime(2001);
    f.container.dispatch('pointerup', {pointerType: 'mouse', clientX: 160});
    assert.equal(f.video.paused, true);
    assert.deepEqual(calls, ['enter-fullscreen']);
});

test('video touch single taps wait for the double-tap window and double taps use existing zones', async function (t) {
    const clock = createClock(t);
    const f = createFixture(t);
    f.video.dispatch('pointerup', {pointerType: 'touch', clientX: 160});
    assert.equal(f.video.paused, true);
    assert.equal(clock.timers.size, 1);
    clock.setTime(1299);
    assert.equal(f.video.paused, true);
    clock.setTime(1300);
    assert.equal(f.video.paused, false);
    assert.equal(clock.timers.size, 0);
    await settle();
    const host = createHost({video: {currentTime: 50}});
    const calls = applyPresentation(host);
    const double = createFixture(t, {keyboardSeekStep: 30}, host);
    for (const [start, clientX, expected] of [[2000, 20, 40], [2500, 300, 50], [3000, 160, 50]]) {
        clock.setTime(start);
        double.video.dispatch('pointerup', {pointerType: 'touch', clientX});
        clock.setTime(start + 299);
        double.video.dispatch('pointerup', {pointerType: 'touch', clientX});
        assert.equal(double.video.currentTime, expected);
        assert.equal(clock.timers.size, 0);
    }
    await settle();
    assert.deepEqual(calls, ['enter-fullscreen']);
    assert.equal(double.video.playCalls, 0);
});

test('video gesture callbacks replace defaults, receive local coordinates and isolate consumer failures', async function (t) {
    const clock = createClock(t);
    const logged = t.mock.method(console, 'error', () => {});
    const taps = [];
    const config = {};
    for (const name of ['onSingleClick', 'onDoubleClick', 'onSingleTap', 'onDoubleTap']) {
        config[name] = tap => { taps.push({name, ...tap}); throw new Error(name); };
    }
    const f = createFixture(t, config);
    for (const [time, type, x] of [[1000, 'mouse', 20], [1200, 'mouse', 300], [1600, 'touch', 160]]) {
        clock.setTime(time);
        f.video.dispatch('pointerup', {pointerType: type, clientX: x});
    }
    clock.setTime(1900);
    clock.setTime(2000);
    f.video.dispatch('pointerup', {pointerType: 'touch', clientX: 20});
    clock.setTime(2299);
    f.video.dispatch('pointerup', {pointerType: 'touch', clientX: 300});
    assert.deepEqual(taps, [
        {name: 'onSingleClick', x: 10, width: 300, zone: 'left', time: 1000},
        {name: 'onDoubleClick', x: 290, width: 300, zone: 'right', time: 1200},
        {name: 'onSingleTap', x: 150, width: 300, zone: 'center', time: 1600},
        {name: 'onDoubleTap', x: 290, width: 300, zone: 'right', time: 2299},
    ]);
    assert.equal(logged.mock.callCount(), 4);
    assert.equal(f.video.playCalls, 0);
    assert.equal(f.video.currentTime, 0);
    assert.equal(clock.timers.size, 0);
    await settle();
});

test('video gesture exclusions include nested controls, prevented events and non-primary mouse buttons', function (t) {
    const clock = createClock(t);
    const taps = [];
    const f = createFixture(t, {onSingleClick: tap => taps.push(tap), onDoubleClick: tap => taps.push(tap)});
    const selectors = [];
    for (const details of [
        {defaultPrevented: true}, {button: 1}, {button: 2},
        {target: {isContentEditable: true}},
        {target: {closest(selector) { selectors.push(selector); return {}; }}},
    ]) f.video.dispatch('pointerup', {pointerType: 'mouse', clientX: 160, ...details});
    assert.deepEqual(taps, []);
    assert.equal(clock.timers.size, 0);
    assert.match(selectors[0], /button, a, \[role='slider'\]/);
    assert.match(selectors[0], /data-video-controls-bar/);
    for (const target of [null, {tagName: 'SPAN'}, {closest() { return null; }}]) {
        f.video.dispatch('pointerup', {pointerType: 'mouse', clientX: 160, target});
    }
    assert.equal(taps.length, 3);
    f.video.getBoundingClientRect = undefined;
    f.video.dispatch('pointerup', {pointerType: 'mouse', clientX: 160});
    assert.equal(taps.length, 3);
});

test('video disabling touch releases a pending timer but keeps mouse behavior available', async function (t) {
    const clock = createClock(t);
    const taps = [];
    const f = createFixture(t, {onSingleTap: tap => taps.push(tap)});
    f.video.dispatch('pointerup', {pointerType: 'touch', clientX: 160});
    const retained = [...clock.timers.values()][0].callback;
    f.engine.setTouchGestures(false);
    assert.equal(clock.timers.size, 0);
    assert.equal(clock.cleared.length, 1);
    retained();
    f.video.dispatch('pointerup', {pointerType: 'touch', clientX: 160});
    assert.equal(clock.timers.size, 0);
    f.video.dispatch('pointerup', {pointerType: 'mouse', clientX: 160});
    assert.equal(f.video.paused, false);
    await settle();
    f.engine.setTouchGestures(true);
    clock.setTime(1500);
    f.video.dispatch('pointerup', {pointerType: 'pen', clientX: 160});
    clock.setTime(1800);
    assert.equal(taps.length, 1);
});

test('video destruction cancels owned touch timers and makes retained callbacks inert', function (t) {
    const clock = createClock(t);
    const taps = [];
    const f = createFixture(t, {onSingleTap: tap => taps.push(tap)});
    f.video.dispatch('pointerup', {pointerType: 'touch', clientX: 160});
    const retained = [...clock.timers.values()][0].callback;
    f.engine.destroy();
    assert.equal(clock.timers.size, 0);
    assert.equal(clock.cleared.length, 1);
    retained();
    clock.setTime(2000);
    assert.deepEqual(taps, []);
    assert.equal(f.video.playCalls, 0);
});

test('video a retained cancelled tap callback cannot release a newer timer handle', function (t) {
    const clock = createClock(t);
    const f = createFixture(t);
    f.video.dispatch('pointerup', {pointerType: 'touch', clientX: 160});
    const stale = [...clock.timers.values()][0].callback;
    f.engine.setTouchGestures(false);
    f.engine.setTouchGestures(true);
    clock.setTime(1500);
    f.video.dispatch('pointerup', {pointerType: 'touch', clientX: 160});
    stale();
    assert.equal(clock.timers.size, 1);
    f.engine.destroy();
    assert.equal(clock.timers.size, 0);
    assert.equal(f.video.playCalls, 0);
});
