import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createVirtualizer} from 'strata-packages/ui-interactions/virtualize';
import {createFixture, createHost} from './helpers/virtualize.ts';

test('virtualize releases exact listeners and observer and cancels an outstanding frame once', function (t) {
    const f = createFixture(t, {count: 40, strategy: 'virtual'}, createHost({separateScrollElement: true}));
    assert.deepEqual(f.observers[0].observed, [f.gridElement]);
    const registration = f.scrollElement.registrations[0];
    assert.equal(registration.type, 'scroll');
    assert.deepEqual(registration.options, {passive: true});
    f.scrollTo(440);
    const frame = f.requestedFrames[0];
    assert.equal(frame.id, 0);
    assert.equal(f.frames.size, 1);
    f.engine.destroy();
    f.engine.destroy();
    assert.deepEqual(f.scrollElement.removals, [registration]);
    assert.equal(f.scrollElement.removals[0].handler, registration.handler);
    assert.equal(f.scrollElement.removals[0].options, registration.options);
    assert.equal(f.scrollElement.handlers.get('scroll').size, 0);
    assert.equal(f.observers[0].disconnects, 1);
    assert.deepEqual(f.cancelledFrames, [frame.id]);
    assert.equal(f.frames.size, 0);
    assert.equal(f.events.length, 1);
});

test('virtualize saved late event, observer and frame callbacks cannot read geometry or notify after destruction', function (t) {
    let keyCalls = 0;
    const f = createFixture(t, {count: 40, strategy: 'virtual', getItemKey(index) { keyCalls++; return index; }});
    const scroll = f.scrollElement.registrations[0].handler;
    const resize = f.observers[0].callback;
    f.scrollTo(440);
    const frame = f.requestedFrames[0].callback;
    f.engine.destroy();
    const reads = f.styleReads.length;
    const keys = keyCalls;
    f.style.gridTemplateColumns = '200px';
    scroll({type: 'scroll'});
    resize([]);
    frame(0);
    f.flushFrames();
    assert.equal(f.styleReads.length, reads);
    assert.equal(keyCalls, keys);
    assert.equal(f.requestedFrames.length, 1);
    assert.equal(f.events.length, 1);
    assert.equal(f.frames.size, 0);
});

test('virtualize destroyed controls and valid subscriptions are inert while public snapshots remain readable and fresh', function (t) {
    const keys = ['a', 'b'];
    const f = createFixture(t, {count: 2, getItemKey: index => keys[index]});
    f.engine.destroy();
    const state = f.engine.getState();
    let calls = 0;
    const detach = f.engine.subscribe(() => calls++);
    f.engine.scrollToOffset(440);
    f.engine.scrollToIndex(4);
    f.engine.scrollToOffset(NaN);
    f.engine.scrollToIndex(-1);
    detach();
    detach();
    f.resize();
    f.scrollElement.dispatch('scroll');
    assert.equal(calls, 0);
    assert.deepEqual(f.scrollElement.scrollWrites, []);
    assert.equal(f.events.length, 1);
    assert.deepEqual(f.engine.getState(), state);
    assert.notEqual(f.engine.getState().items, state.items);
    keys[0] = 'changed';
    assert.equal(f.engine.getState().items[0].key, 'changed');
    assert.deepEqual(f.engine.getItemRect(1), {top: 0, left: 120, width: 100, height: 100});
});

test('virtualize destruction from a subscriber stops later deliveries and cancels subscriber-scheduled scrolling', function (t) {
    const f = createFixture(t, {count: 40, strategy: 'virtual'});
    let later = 0;
    f.engine.subscribe(() => {
        f.scrollTo(440);
        f.engine.destroy();
    });
    f.engine.subscribe(() => later++);
    f.style.gridTemplateColumns = '120px 120px';
    f.resize();
    assert.equal(later, 0);
    assert.equal(f.events.length, 2);
    assert.equal(f.frames.size, 0);
    assert.equal(f.cancelledFrames.length, 1);
    assert.equal(f.observers[0].disconnects, 1);
    assert.equal(f.engine.getState().cellWidth, 120);
});

test('virtualize destruction inside an automatic key provider stops preparation while explicit reads still resolve keys', function (t) {
    let armed = false;
    let calls = 0;
    let engine;
    const f = createFixture(t, {count: 4, getItemKey(index) {
        calls++;
        if (armed) { armed = false; engine.destroy(); }
        return index;
    }});
    engine = f.engine;
    calls = 0;
    armed = true;
    f.style.gridTemplateColumns = '120px';
    f.resize();
    assert.equal(calls, 1);
    assert.equal(f.events.length, 1);
    assert.equal(f.observers[0].disconnects, 1);
    assert.equal(engine.getState().items.length, 4);
    assert.equal(calls, 5);
    assert.equal(engine.getState().cellWidth, 120);
});

test('virtualize construction failures release initialized resources and rethrow the original error', function () {
    for (const source of ['keys', 'geometry', 'observation']) {
        const host = createHost();
        const failure = new Error(`${source} failed`);
        const reported = [];
        if (source === 'geometry') host.defaultView.getComputedStyle = () => { throw failure; };
        if (source === 'observation') {
            const createObserver = host.defaultView.ResizeObserver;
            host.defaultView.ResizeObserver = function (callback) {
                const observer = new createObserver(callback);
                observer.observe = () => { throw failure; };
                return observer;
            };
        }
        assert.throws(() => createVirtualizer({
            gridElement: host.gridElement, count: 1,
            onError: error => reported.push(error),
            getItemKey(index) { if (source === 'keys') throw failure; return index; },
        }), error => error === failure);
        assert.deepEqual(host.gridElement.removals, host.gridElement.registrations);
        assert.equal(host.gridElement.handlers.get('scroll')?.size || 0, 0);
        assert.equal(host.observers[0].disconnects, 1);
        assert.equal(host.frames.size, 0);
        assert.deepEqual(reported, []);
    }
});

test('virtualize instances sharing a host own their listeners, observers and pending frames independently', function (t) {
    const host = createHost();
    const first = createFixture(t, {count: 40, strategy: 'virtual', overscan: 0}, host);
    const second = createFixture(t, {count: 80, strategy: 'virtual', overscan: 0}, host);
    host.scrollTo(440);
    assert.equal(host.frames.size, 2);
    first.engine.destroy();
    assert.equal(host.frames.size, 1);
    assert.equal(host.gridElement.handlers.get('scroll').size, 1);
    assert.equal(host.observers[0].disconnects, 1);
    assert.equal(host.observers[1].disconnects, 0);
    host.flushFrames();
    assert.equal(first.events.length, 1);
    assert.equal(second.events.length, 2);
    assert.deepEqual(second.events[1].range, {startIndex: 8, endIndex: 13});
    host.style.gridTemplateColumns = '120px';
    host.resize();
    assert.equal(first.events.length, 1);
    assert.equal(second.events.length, 3);
});

test('virtualize uses each grid own document for style, observer and animation frame scheduling', function (t) {
    const first = createFixture(t, {count: 40, strategy: 'virtual', overscan: 0});
    const second = createFixture(t, {count: 40, strategy: 'virtual', overscan: 0}, createHost({style: {gridTemplateColumns: '75px'}}));
    assert.notEqual(first.ownerDocument, second.ownerDocument);
    assert.notEqual(first.defaultView, second.defaultView);
    assert.equal(first.events[0].cellWidth, 100);
    assert.equal(second.events[0].cellWidth, 75);
    first.scrollTo(440);
    assert.equal(first.frames.size, 1);
    assert.equal(second.frames.size, 0);
    second.flushFrames();
    assert.equal(first.events.length, 1);
    first.flushFrames();
    assert.equal(first.events.length, 2);
    assert.equal(second.events.length, 1);
    second.style.gridTemplateColumns = '150px';
    second.resize();
    assert.equal(second.events.length, 2);
    assert.equal(first.events.length, 2);
    assert.deepEqual(first.observers[0].observed, [first.gridElement]);
    assert.deepEqual(second.observers[0].observed, [second.gridElement]);
    first.engine.destroy();
    second.scrollTo(640);
    second.flushFrames();
    assert.equal(second.events.length, 3);
});
