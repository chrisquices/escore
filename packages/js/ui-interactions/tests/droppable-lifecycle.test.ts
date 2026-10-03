import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture} from './helpers/droppable.ts';

test('droppable detaches exactly its registered listeners and preserves capture-phase options', function (t) {
    const f = createFixture(t);
    assert.deepEqual(f.registrations.map(({type, options}) => ({type, options})), [
        {type: 'pointerdown', options: {capture: true}},
        {type: 'pointermove', options: undefined},
        {type: 'pointerup', options: undefined},
        {type: 'pointercancel', options: undefined},
    ]);
    f.engine.destroy();
    f.engine.destroy();
    assert.equal(f.handlers.size, 0);
    assert.deepEqual(f.removals, f.registrations);
    assert.equal(f.events.length, 1);
    assert.equal(f.drops.length, 0);
});

for (const phase of ['idle', 'armed', 'dragging']) {
    test(`droppable ignores every saved event handler after destruction while ${phase}`, function (t) {
        const f = createFixture(t);
        const handlers = new Map(f.handlers);
        f.createTarget('zone');
        if (phase !== 'idle') f.handlePointer('pointerdown');
        if (phase === 'dragging') f.handlePointer('pointermove', 10, 10);
        f.engine.destroy();
        const state = f.engine.getState();
        const count = f.events.length;
        for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
            handlers.get(type)({clientX: 20, clientY: 20, pointerId: 1});
        }
        assert.deepEqual(f.engine.getState(), state);
        assert.equal(f.events.length, count);
        assert.equal(f.drops.length, 0);
    });
}

test('droppable releases its pointer capture when destroyed during a drag', function (t) {
    const f = createFixture(t);
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 10, 10);
    assert.equal(f.captures.has(1), true);
    f.engine.destroy();
    f.engine.destroy();
    assert.equal(f.captures.size, 0);
    assert.deepEqual(f.releaseCalls, [1]);
    assert.equal(f.drops.length, 0);
});

test('droppable makes target and subscription handles harmless after destruction', function (t) {
    const f = createFixture(t);
    const target = f.createTarget('zone');
    const detach = f.engine.subscribe(() => assert.fail('destroyed engine must not notify'));
    f.engine.destroy();
    target.remove();
    target.remove();
    detach();
    detach();
    f.engine.registerTarget(null, 'late')();
    f.engine.subscribe(() => assert.fail('late subscriber must not run'))();
    assert.equal(f.events.length, 1);
    assert.equal(f.handlers.size, 0);
});

test('droppable instances keep their listeners, gestures, targets and destruction independent', function (t) {
    const first = createFixture(t);
    const second = createFixture(t);
    first.createTarget('first');
    second.createTarget('second');
    first.handlePointer('pointerdown');
    first.handlePointer('pointermove', 10, 10);
    assert.equal(second.events.length, 1);
    first.engine.destroy();
    second.handlePointer('pointerdown');
    second.handlePointer('pointermove', 10, 10);
    second.handlePointer('pointerup');
    assert.equal(second.drops.length, 1);
    assert.equal(second.drops[0].target, 'second');
    assert.equal(first.drops.length, 0);
    assert.equal(first.events.length, 2);
});

test('droppable returned state does not expose mutable engine-owned coordinates', function (t) {
    const f = createFixture(t);
    f.handlePointer('pointerdown', 1, 2);
    f.handlePointer('pointermove', 10, 20);
    const before = f.engine.getState();
    const snapshot = f.engine.getState();
    assert.notEqual(snapshot, before);
    snapshot.dragging = false;
    snapshot.point.x = 999;
    snapshot.origin.y = 999;
    assert.equal(f.engine.getState().dragging, true);
    assert.deepEqual(f.engine.getState().point, {x: 10, y: 20});
    assert.deepEqual(f.engine.getState().origin, {x: 1, y: 2});
    assert.equal(f.events.length, 2);
});

test('droppable remains settled and usable when the drop callback throws', function (t) {
    const calls = [];
    const errors = t.mock.method(console, 'error', () => {});
    const f = createFixture(t, {onDrop: (payload, target) => {
        calls.push({payload, target, state: f.engine.getState()});
        throw new Error('consumer failure');
    }});
    f.createTarget('zone');
    for (let index = 0; index < 2; index++) {
        f.handlePointer('pointerdown');
        f.handlePointer('pointermove', 10, 10);
        assert.doesNotThrow(() => f.handlePointer('pointerup'));
        assert.deepEqual(f.engine.getState(), f.events[0]);
    }
    assert.equal(errors.mock.callCount(), 2);
    assert.equal(calls.length, 2);
    for (const call of calls) {
        assert.equal(call.payload, f.payload);
        assert.equal(call.target, 'zone');
        assert.deepEqual(call.state, f.events[0]);
    }
});

test('droppable preserves a new gesture started by its drop callback', function (t) {
    const f = createFixture(t, {onDrop: () => {
        f.handlePointer('pointerdown', 1, 2, 2);
        f.handlePointer('pointermove', 11, 12, 2);
    }});
    f.createTarget('zone');
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 10, 10);
    f.handlePointer('pointerup');
    assert.equal(f.engine.getState().dragging, true);
    assert.deepEqual(f.engine.getState().origin, {x: 1, y: 2});
    assert.deepEqual(f.captureCalls, [1, 2]);
    assert.deepEqual(f.releaseCalls, [1]);
    f.handlePointer('pointercancel', 11, 12, 2);
    assert.deepEqual(f.engine.getState(), f.events[0]);
});

test('droppable suppresses the pending drop callback if a settled-state subscriber destroys it', function (t) {
    const f = createFixture(t);
    f.createTarget('zone');
    f.engine.subscribe(state => { if (!state.dragging) f.engine.destroy(); });
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 10, 10);
    f.handlePointer('pointerup');
    assert.equal(f.handlers.size, 0);
    assert.equal(f.drops.length, 0);
});
