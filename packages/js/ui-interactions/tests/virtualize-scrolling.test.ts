import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture, createHost, getIndices} from './helpers/virtualize.ts';

test('virtualize starts from the current scroll position without waiting for a scroll event', function (t) {
    const f = createFixture(t, {count: 40, strategy: 'virtual', overscan: 0}, createHost({scrollTop: 440}));
    assert.deepEqual(f.events[0].range, {startIndex: 8, endIndex: 13});
    assert.deepEqual(f.engine.getState(), f.events[0]);
    assert.equal(f.requestedFrames.length, 0);
    const css = createFixture(t, {count: 4, strategy: 'css'}, createHost({scrollTop: 440}));
    assert.deepEqual(getIndices(css.events[0]), [0, 1, 2, 3]);
});

test('virtualize coalesces scroll bursts and suppresses motion inside the same row window', function (t) {
    const f = createFixture(t, {count: 40, strategy: 'virtual', overscan: 0});
    for (const offset of [110, 330, 550]) f.scrollTo(offset);
    assert.equal(f.frames.size, 1);
    assert.equal(f.requestedFrames.length, 1);
    assert.equal(f.events.length, 1);
    f.flushFrames();
    assert.equal(f.events.length, 2);
    assert.deepEqual(f.events[1].range, {startIndex: 10, endIndex: 15});
    for (const offset of [550, 551, 559]) {
        f.scrollTo(offset);
        f.flushFrames();
    }
    assert.equal(f.events.length, 2);
});

test('virtualize scroll controls use row geometry and defer notification until the browser scroll event', function (t) {
    const f = createFixture(t, {count: 40, strategy: 'virtual', overscan: 0}, createHost({scrollLimit: 990}));
    f.engine.scrollToIndex(5);
    assert.equal(f.scrollElement.scrollTop, 220);
    assert.equal(f.frames.size, 0);
    assert.equal(f.events.length, 1);
    f.scrollElement.dispatch('scroll');
    f.flushFrames();
    assert.deepEqual(f.events[1].range, {startIndex: 4, endIndex: 9});
    f.engine.scrollToOffset(-100);
    assert.equal(f.scrollElement.scrollTop, 0);
    assert.equal(f.scrollElement.scrollWrites.at(-1), 0);
    f.engine.scrollToOffset(110.25);
    assert.equal(f.scrollElement.scrollTop, 110.25);
    f.engine.scrollToIndex(999);
    assert.equal(f.scrollElement.scrollWrites.at(-1), 54890);
    assert.equal(f.scrollElement.scrollTop, 990);
    f.scrollElement.dispatch('scroll');
    f.flushFrames();
    assert.deepEqual(f.events.at(-1).range, {startIndex: 18, endIndex: 23});
});

test('virtualize validates scroll arguments without writing or publishing state', function (t) {
    const f = createFixture(t, {count: 10, strategy: 'virtual'});
    for (const value of [undefined, null, false, '1', {}, NaN, Infinity, -Infinity]) {
        assert.throws(() => f.engine.scrollToOffset(value), /scrollToOffset.*finite number/);
    }
    for (const value of [undefined, null, false, '1', {}, NaN, Infinity, -Infinity, -1, 1.5]) {
        assert.throws(() => f.engine.scrollToIndex(value), /scrollToIndex.*non-negative integer/);
    }
    assert.deepEqual(f.scrollElement.scrollWrites, []);
    assert.equal(f.events.length, 1);
    assert.equal(f.frames.size, 0);
});

test('virtualize clamps overscrolled windows and recomputes them after a column resize', function (t) {
    const f = createFixture(t, {count: 10, strategy: 'virtual', overscan: 0});
    f.scrollTo(11000);
    f.flushFrames();
    assert.deepEqual(f.engine.getState().range, {startIndex: 8, endIndex: 9});
    assert.deepEqual(getIndices(f.engine.getState()), [8, 9]);
    f.style.gridTemplateColumns = '50px 50px 50px 50px 50px';
    f.resize();
    assert.deepEqual(f.engine.getState().range, {startIndex: 5, endIndex: 9});
    assert.equal(f.engine.getState().containerStyle.paddingTop, '60px');
    assert.deepEqual(getIndices(f.engine.getState()), [5, 6, 7, 8, 9]);
});

test('virtualize resize reads current scroll and viewport synchronously while a scroll frame is pending', function (t) {
    const f = createFixture(t, {count: 40, strategy: 'virtual', overscan: 0});
    f.scrollTo(440);
    f.style.gridTemplateColumns = '200px 200px';
    f.resize();
    assert.equal(f.events.length, 2);
    assert.equal(f.frames.size, 1);
    assert.deepEqual(f.events[1].range, {startIndex: 4, endIndex: 7});
    f.flushFrames();
    assert.equal(f.events.length, 2);
    f.scrollElement.clientHeight = 630;
    f.resize();
    assert.equal(f.events.length, 3);
    assert.deepEqual(f.events[2].range, {startIndex: 4, endIndex: 11});
    f.resize();
    assert.equal(f.events.length, 3);
});

test('virtualize separates grid geometry from scroller offset/viewport with the existing shared content origin', function (t) {
    const f = createFixture(t, {count: 40, strategy: 'virtual', overscan: 0}, createHost({
        separateScrollElement: true, scrollTop: 220, clientHeight: 110,
        gridRect: {top: -190, left: 20, height: 2190},
        scrollRect: {top: 30, left: 20, height: 110},
    }));
    assert.equal(f.gridElement.scrollTop, 0);
    assert.deepEqual(f.events[0].range, {startIndex: 4, endIndex: 7});
    assert.deepEqual(f.engine.getItemRect(4), {top: 220, left: 0, width: 100, height: 100});
    assert.deepEqual(f.styleReads, [f.gridElement]);
    assert.deepEqual(f.observers[0].observed, [f.gridElement]);
    assert.equal(f.gridElement.registrations.length, 0);
    assert.equal(f.scrollElement.registrations[0].type, 'scroll');
    f.engine.scrollToIndex(8);
    assert.equal(f.scrollElement.scrollTop, 440);
    assert.equal(f.gridElement.scrollTop, 0);
    f.scrollElement.dispatch('scroll');
    f.flushFrames();
    assert.deepEqual(f.events.at(-1).range, {startIndex: 8, endIndex: 11});
    f.scrollElement.clientHeight = 220;
    f.resize();
    assert.deepEqual(f.events.at(-1).range, {startIndex: 8, endIndex: 13});
});

test('virtualize queues a subscriber-triggered scroll for the following frame', function (t) {
    const f = createFixture(t, {count: 40, strategy: 'virtual', overscan: 0});
    f.engine.subscribe(state => { if (state.range.startIndex === 2) f.scrollTo(440); });
    f.scrollTo(110);
    f.flushFrames();
    assert.deepEqual(f.events.at(-1).range, {startIndex: 2, endIndex: 7});
    assert.equal(f.frames.size, 1);
    f.flushFrames();
    assert.deepEqual(f.events.at(-1).range, {startIndex: 8, endIndex: 13});
    assert.equal(f.events.length, 3);
    assert.equal(f.frames.size, 0);
});
