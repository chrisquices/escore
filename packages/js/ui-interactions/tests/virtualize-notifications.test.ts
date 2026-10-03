import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture, createHost} from './helpers/virtualize.ts';

test('virtualize subscriptions and reads stay silent until a synchronous resize change', function (t) {
    const f = createFixture(t, {count: 4});
    const received = [];
    f.engine.subscribe(state => received.push(state));
    assert.deepEqual(f.engine.getState(), f.events[0]);
    f.resize();
    assert.equal(received.length, 0);
    f.style.gridTemplateColumns = '120px 120px';
    f.resize();
    assert.equal(received.length, 1);
    assert.equal(received[0].cellWidth, 120);
    assert.equal(f.frames.size, 0);
    f.resize();
    assert.equal(received.length, 1);
});

test('virtualize suppresses repeated events and geometry changes with identical published rounding', function (t) {
    for (const strategy of ['css', 'virtual']) {
        const f = createFixture(t, {count: 40, strategy, overscan: 0});
        f.resize();
        for (const offset of [1, 2, 2]) { f.scrollTo(offset); f.flushFrames(); }
        f.style.gridTemplateColumns = '100.0001px 100.0001px';
        f.resize();
        assert.equal(f.events.length, 1);
        assert.equal(f.engine.getItemRect(0).width, 100.0001);
        f.style.gridTemplateColumns = '100.01px 100.01px';
        f.resize();
        assert.equal(f.events.length, 2);
    }
    const empty = createFixture(t, {count: 0}, createHost({hasCell: false, style: {gridTemplateColumns: 'none'}}));
    empty.style.gridTemplateColumns = '0.004px';
    empty.resize();
    assert.equal(empty.events.length, 1);
});

test('virtualize notices style presence even when tiny dimensions round to zero', function (t) {
    const f = createFixture(t, {count: 1}, createHost({hasCell: false, style: {gridTemplateColumns: 'none'}}));
    f.style.gridTemplateColumns = '0.004px';
    f.resize();
    assert.equal(f.events.length, 2);
    assert.equal(f.events[1].cellWidth, 0);
    assert.equal(f.events[1].items[0].style.containIntrinsicSize, '0px 0px');
    f.cellRect.width = 1;
    f.cellRect.height = 1;
    f.gridElement.firstElementChild = f.firstCell;
    f.resize();
    assert.equal(f.events.length, 3);
    assert.equal(f.events[2].containerStyle.gridAutoRows, '0px');
});

test('virtualize compares virtual padding and height without treating column gaps as published state', function (t) {
    const f = createFixture(t, {count: 40, strategy: 'virtual', overscan: 0}, createHost({scrollTop: 220}));
    f.style.columnGap = '30px';
    f.resize();
    assert.equal(f.events.length, 1);
    assert.equal(f.engine.getItemRect(1).left, 130);
    f.style.rowGap = '15px';
    f.resize();
    assert.equal(f.events.length, 2);
    assert.equal(f.events[1].totalSize, 2285);
    assert.equal(f.events[1].containerStyle.paddingTop, '115px');
    assert.deepEqual(f.events[1].range, {startIndex: 2, endIndex: 7});
});

test('virtualize preserves opaque key order without serialization and reads keys once per attempted delivery', function (t) {
    const stringify = t.mock.method(JSON, 'stringify', () => { throw new Error('state serialization'); });
    for (const strategy of ['css', 'virtual']) {
        let calls = 0;
        const keys = ['0', 7, 'a', -1, NaN, Infinity];
        const f = createFixture(t, {count: keys.length, strategy, getItemKey(index) { calls++; return keys[index]; }});
        assert.equal(calls, 6);
        assert.deepEqual(f.events[0].items.map(item => item.key), keys);
        f.engine.subscribe(() => {});
        f.engine.subscribe(() => {});
        f.resize();
        assert.equal(calls, 12);
        assert.equal(f.events.length, 1);
        keys[0] = 0;
        assert.equal(f.engine.getState().items[0].key, 0);
        assert.equal(f.events.length, 1);
        f.resize();
        assert.equal(f.events.length, 2);
        assert.equal(calls, 24);
        assert.equal(f.events[1].items[0].key, 0);
        keys[1] = 'new';
        f.scrollTo(1);
        f.flushFrames();
        assert.equal(f.events.length, 3);
        f.resize();
        assert.equal(f.events.length, 3);
    }
    assert.equal(stringify.mock.callCount(), 0);
    stringify.mock.restore();
});

test('virtualize leaves off-window key changes silent until those items enter the window', function (t) {
    const keys = Array.from({length: 20}, (_, index) => index);
    const f = createFixture(t, {count: 20, strategy: 'virtual', overscan: 0, getItemKey: index => keys[index]});
    keys[15] = 'later';
    f.resize();
    assert.equal(f.events.length, 1);
    f.scrollTo(660);
    f.flushFrames();
    assert.equal(f.events.length, 2);
    assert.equal(f.events[1].items.find(item => item.index === 15).key, 'later');
});

test('virtualize isolates throwing initial and later consumers without rerouting provider failures', function (t) {
    const errors = t.mock.method(console, 'error', () => {});
    const reported = [];
    let failKeys = false;
    const failure = new Error('key provider failed');
    const f = createFixture(t, {
        count: 4,
        onChange() { throw new Error('onChange failed'); },
        onError: error => reported.push(error),
        getItemKey(index) { if (failKeys) throw failure; return index; },
    });
    assert.equal(errors.mock.callCount(), 1);
    f.engine.subscribe(() => { throw new Error('subscriber failed'); });
    const received = [];
    f.engine.subscribe(state => received.push(state));
    f.style.gridTemplateColumns = '120px 120px';
    f.resize();
    assert.equal(errors.mock.callCount(), 3);
    assert.equal(received.length, 1);
    failKeys = true;
    assert.throws(() => f.engine.getState(), error => error === failure);
    assert.throws(() => f.resize(), error => error === failure);
    f.scrollTo(220);
    assert.throws(() => f.flushFrames(), error => error === failure);
    assert.equal(f.events.length, 2);
    assert.deepEqual(reported, []);
    failKeys = false;
    f.style.gridTemplateColumns = '140px 140px';
    f.scrollTo(330);
    f.flushFrames();
    f.resize();
    assert.equal(received.at(-1).cellWidth, 140);
    assert.equal(received.length, 2);
});

test('virtualize stable duplicate subscriptions and unsubscribe handles preserve listener identity', function (t) {
    const f = createFixture(t, {count: 4});
    const received = [];
    const listener = state => received.push(state);
    const first = f.engine.subscribe(listener);
    const second = f.engine.subscribe(listener);
    f.style.gridTemplateColumns = '120px';
    f.resize();
    assert.equal(received.length, 1);
    second();
    f.style.gridTemplateColumns = '140px';
    f.resize();
    assert.equal(received.length, 1);
    f.engine.subscribe(listener);
    f.style.gridTemplateColumns = '160px';
    f.resize();
    assert.equal(received.length, 2);
    first();
    first();
    f.style.gridTemplateColumns = '180px';
    f.resize();
    assert.equal(received.length, 2);
});

test('virtualize honors unsubscription during delivery', function (t) {
    const f = createFixture(t, {count: 4});
    let detach;
    let received = 0;
    const stop = f.engine.subscribe(() => detach());
    const listener = () => received++;
    detach = f.engine.subscribe(listener);
    f.style.gridTemplateColumns = '120px';
    f.resize();
    assert.equal(received, 0);
    stop();
    f.engine.subscribe(listener);
    f.style.gridTemplateColumns = '140px';
    f.resize();
    assert.equal(received, 1);
});

test('virtualize reentrant resize supersedes stale deliveries, including returning to the preceding state', function (t) {
    for (const finalWidth of [100, 200]) {
        const f = createFixture(t, {count: 4});
        const received = [];
        f.engine.subscribe(state => {
            if (state.cellWidth === 150) {
                f.style.gridTemplateColumns = `${finalWidth}px ${finalWidth}px`;
                f.resize();
            }
        });
        f.engine.subscribe(state => received.push(state));
        f.style.gridTemplateColumns = '150px 150px';
        f.resize();
        assert.deepEqual(f.events.map(state => state.cellWidth), [100, 150, finalWidth]);
        assert.deepEqual(received.map(state => state.cellWidth), [finalWidth]);
        assert.deepEqual(received[0], f.engine.getState());
    }
});

test('virtualize reentrant no-op resize does not recurse or starve later subscribers', function (t) {
    const f = createFixture(t, {count: 4});
    let received = 0;
    f.engine.subscribe(() => f.resize());
    f.engine.subscribe(() => received++);
    f.style.gridTemplateColumns = '120px';
    f.resize();
    assert.equal(f.events.length, 2);
    assert.equal(received, 1);
});

test('virtualize discards notification preparation superseded by a key provider resize', function (t) {
    const host = createHost();
    let armed = false;
    const f = createFixture(t, {count: 6, getItemKey(index) {
        if (armed && index === 0) {
            armed = false;
            host.style.gridTemplateColumns = '50px 50px 50px 50px';
            host.resize();
        }
        return index;
    }}, host);
    armed = true;
    f.resize();
    assert.deepEqual(f.events.map(state => state.columns), [2, 4]);
    assert.deepEqual(f.events.at(-1), f.engine.getState());
    f.resize();
    assert.equal(f.events.length, 2);
});

test('virtualize owns independent item arrays, item objects, styles, container styles and ranges for every reader', function (t) {
    for (const strategy of ['css', 'virtual']) {
        const f = createFixture(t, {count: 20, strategy, overscan: 0, onChange(state) {
            state.items[0].key = 'corrupt';
            state.items[0].style.color = 'corrupt';
            state.items.pop();
            state.containerStyle.gridAutoRows = 'corrupt';
            if (state.range) state.range.startIndex = 999;
        }});
        const received = [];
        f.engine.subscribe(state => {
            state.items[0].index = 999;
            state.items[0].style.color = 'corrupt';
            state.items.length = 0;
            state.containerStyle.gridAutoRows = 'corrupt';
            if (state.range) state.range.endIndex = 999;
            state.columns = 999;
        });
        f.engine.subscribe(state => received.push(state));
        f.style.gridTemplateColumns = '120px 120px';
        f.resize();
        const state = f.engine.getState();
        assert.deepEqual(received[0], state);
        assert.equal(state.items[0].key, 0);
        assert.equal(state.items[0].index, 0);
        assert.equal(state.items[0].style.color, undefined);
        assert.equal(state.columns, 2);
        assert.equal(state.containerStyle.gridAutoRows, '120px');
        assert.notEqual(received[0], state);
        assert.notEqual(received[0].items, state.items);
        assert.notEqual(received[0].items[0], state.items[0]);
        assert.notEqual(received[0].items[0].style, state.items[0].style);
        assert.notEqual(received[0].containerStyle, state.containerStyle);
        if (state.range) assert.notEqual(received[0].range, state.range);
        state.items[0].style.color = 'red';
        assert.equal(state.items[1].style.color, undefined);
        state.items.length = 0;
        state.containerStyle.gridAutoRows = '0px';
        if (state.range) state.range.endIndex = 999;
        assert.deepEqual(f.engine.getState(), received[0]);
        f.resize();
        assert.equal(f.events.length, 2);
    }
});
