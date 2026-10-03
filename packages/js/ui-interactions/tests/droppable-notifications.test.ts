import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture} from './helpers/droppable.ts';

test('droppable preserves initial delivery, thresholds, synchronous changes and settled drops', function (t) {
    let allowed = true;
    const f = createFixture(t, {canDrop: () => allowed});
    const target = {id: 'zone'};
    f.createTarget(target);
    assert.equal(f.events.length, 1);
    assert.equal(f.events[0].dragging, false);

    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 1, 1);
    assert.equal(f.events.length, 1);
    f.handlePointer('pointermove', 10, 10);
    assert.equal(f.events.length, 2);
    assert.equal(f.events[1].payload, f.payload);
    assert.equal(f.events[1].activeTarget, target);
    assert.equal(f.events[1].canDropHere, true);
    assert.equal(f.captures.has(1), true);

    f.handlePointer('pointermove', 10, 10);
    assert.equal(f.events.length, 2);
    allowed = false;
    f.handlePointer('pointermove', 10, 10);
    assert.equal(f.events.length, 3);
    assert.equal(f.events[2].canDropHere, false);
    allowed = true;
    f.handlePointer('pointermove', 10, 10);
    assert.equal(f.events.length, 4);
    f.handlePointer('pointerup', 10, 10);
    assert.equal(f.events.length, 5);
    assert.deepEqual(f.events[4], f.events[0]);
    assert.equal(f.captures.size, 0);
    assert.deepEqual(f.drops, [{value: f.payload, target, state: f.events[0]}]);
});

test('droppable ignores unchanged idle state, foreign pointers and repeated cancellation', function (t) {
    const f = createFixture(t);
    f.handlePointer('pointerdown');
    f.handlePointer('pointerup');
    f.handlePointer('pointerdown');
    f.handlePointer('pointercancel');
    assert.equal(f.events.length, 1);
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 10, 10, 2);
    assert.equal(f.events.length, 1);
    f.handlePointer('pointermove', 10, 10);
    f.handlePointer('pointercancel');
    f.handlePointer('pointercancel');
    assert.equal(f.events.length, 3);
    assert.deepEqual(f.events[2], f.events[0]);
    assert.equal(f.drops.length, 0);
});

test('droppable notifications never serialize or traverse opaque payloads and targets', function (t) {
    const payload = {id: 'item', toJSON() { assert.fail('payload must remain opaque'); }};
    const target = {id: 'zone', toJSON() { assert.fail('target must remain opaque'); }};
    payload.self = payload;
    target.self = target;
    const f = createFixture(t, {getPayload: () => payload});
    f.createTarget(target);
    const stringify = t.mock.method(JSON, 'stringify', () => assert.fail('notifications must not serialize state'));
    f.handlePointer('pointerdown');
    for (let x = 10; x < 30; x++) f.handlePointer('pointermove', x, 10);
    f.handlePointer('pointermove', 29, 10);
    f.handlePointer('pointerup');
    stringify.mock.restore();
    assert.equal(f.events.length, 22);
    assert.equal(f.drops[0].value, payload);
    assert.equal(f.drops[0].target, target);
});

test('droppable reports a different target reference even when its fields are identical', function (t) {
    const f = createFixture(t);
    const first = {id: 'zone'};
    const second = {id: 'zone'};
    const target = f.createTarget(first);
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 10, 10);
    f.engine.registerTarget(target.element, second);
    f.handlePointer('pointermove', 10, 10);
    assert.equal(f.events.length, 3);
    assert.equal(f.events[2].activeTarget, second);
});

test('droppable reentrant changes supersede stale deliveries without starving later subscribers', function (t) {
    const f = createFixture(t);
    const later = [];
    f.engine.subscribe(state => {
        if (state.dragging) f.handlePointer('pointercancel');
    });
    f.engine.subscribe(state => later.push(state));
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 10, 10);
    assert.equal(later.length, 1);
    assert.equal(later[0].dragging, false);
    assert.deepEqual(later[0], f.engine.getState());
});

test('droppable isolates throwing subscribers and preserves unsubscribe and duplicate subscriptions', function (t) {
    const f = createFixture(t);
    const errors = t.mock.method(console, 'error', () => {});
    const received = [];
    const broken = f.engine.subscribe(() => { throw new Error('consumer failure'); });
    const listener = state => received.push(state);
    const detach = f.engine.subscribe(listener);
    f.engine.subscribe(listener);
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 10, 10);
    assert.equal(errors.mock.callCount(), 1);
    assert.equal(received.length, 1);
    broken();
    detach();
    f.handlePointer('pointermove', 20, 10);
    assert.equal(errors.mock.callCount(), 1);
    assert.equal(received.length, 1);
});

test('droppable destruction interrupts delivery and ignores late events', function (t) {
    const f = createFixture(t);
    const lateMove = f.handlers.get('pointermove');
    const later = [];
    f.engine.subscribe(() => f.engine.destroy());
    f.engine.subscribe(state => later.push(state));
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 10, 10);
    assert.equal(later.length, 0);
    assert.equal(f.handlers.size, 0);
    const state = f.engine.getState();
    lateMove({clientX: 20, clientY: 20, pointerId: 1});
    assert.deepEqual(f.engine.getState(), state);
    assert.equal(f.events.length, 2);
    f.engine.subscribe(value => later.push(value))();
    f.engine.destroy();
});

test('droppable subscribing and reading state are silent until the next change', function (t) {
    const f = createFixture(t);
    const received = [];
    f.engine.subscribe(state => received.push(state));
    assert.deepEqual(f.engine.getState(), f.events[0]);
    assert.equal(received.length, 0);
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 10, 10);
    assert.equal(received.length, 1);
    const later = [];
    f.engine.subscribe(state => later.push(state));
    f.handlePointer('pointermove', 10, 10);
    assert.equal(later.length, 0);
    f.handlePointer('pointermove', 20, 10);
    assert.equal(received.length, 2);
    assert.equal(later.length, 1);
});

test('droppable reentrant no-op movements do not starve later subscribers', function (t) {
    const f = createFixture(t);
    const later = [];
    f.engine.subscribe(() => f.handlePointer('pointermove', 10, 10));
    f.engine.subscribe(state => later.push(state));
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 10, 10);
    assert.equal(later.length, 1);
    assert.deepEqual(later[0].point, {x: 10, y: 10});
    assert.equal(f.events.length, 2);
});

test('droppable honors unsubscription during delivery and allows subsequent resubscription', function (t) {
    const f = createFixture(t);
    const later = [];
    let detach;
    const stop = f.engine.subscribe(() => detach());
    const listener = state => later.push(state);
    detach = f.engine.subscribe(listener);
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 10, 10);
    assert.equal(later.length, 0);
    stop();
    f.engine.subscribe(listener);
    f.handlePointer('pointermove', 20, 10);
    assert.equal(later.length, 1);
    assert.deepEqual(later[0].point, {x: 20, y: 10});
});

test('droppable isolates a throwing initial onChange without aborting creation', function (t) {
    const errors = t.mock.method(console, 'error', () => {});
    const f = createFixture(t, {onChange: () => { throw new Error('consumer failure'); }});
    assert.equal(errors.mock.callCount(), 1);
    assert.equal(f.handlers.size, 4);
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 10, 10);
    assert.equal(errors.mock.callCount(), 2);
    assert.equal(f.engine.getState().dragging, true);
});

test('droppable subscribers cannot corrupt coordinates observed by the engine or later subscribers', function (t) {
    const f = createFixture(t);
    const later = [];
    f.engine.subscribe(state => { state.point.x = 999; state.origin.y = 999; });
    f.engine.subscribe(state => later.push(state));
    f.handlePointer('pointerdown', 1, 2);
    f.handlePointer('pointermove', 10, 20);
    assert.deepEqual(later[0].point, {x: 10, y: 20});
    assert.deepEqual(later[0].origin, {x: 1, y: 2});
    assert.deepEqual(f.engine.getState().point, {x: 10, y: 20});
    assert.deepEqual(f.engine.getState().origin, {x: 1, y: 2});
});
