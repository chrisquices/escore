import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture} from './helpers/droppable.ts';

test('droppable ignores pointer activity that has no payload-bearing press', function (t) {
    const f = createFixture(t);
    f.handlePointer('pointermove', 10, 10);
    f.handlePointer('pointerup');
    f.handlePointer('pointercancel');
    assert.equal(f.events.length, 1);
    assert.equal(f.captures.size, 0);
    assert.equal(f.drops.length, 0);
});

for (const payload of [null, undefined]) {
    test(`droppable ignores a ${payload} payload and accepts the next eligible press`, function (t) {
        let value = payload;
        const f = createFixture(t, {getPayload: () => value});
        f.handlePointer('pointerdown');
        f.handlePointer('pointermove', 10, 10);
        assert.equal(f.events.length, 1);
        value = 'item';
        f.handlePointer('pointerdown');
        f.handlePointer('pointermove', 10, 10);
        assert.equal(f.engine.getState().payload, 'item');
    });
}

for (const payload of [0, false, '']) {
    test(`droppable keeps the non-null payload ${JSON.stringify(payload)} intact`, function (t) {
        const f = createFixture(t, {getPayload: () => payload});
        f.createTarget('zone');
        f.handlePointer('pointerdown');
        f.handlePointer('pointermove', 10, 10);
        assert.equal(f.engine.getState().payload, payload);
        f.handlePointer('pointerup');
        assert.equal(f.drops.length, 1);
        assert.equal(f.drops[0].value, payload);
    });
}

test('droppable resolves the payload once per press and supplies the original event', function (t) {
    const calls = [];
    const first = {id: 'first'};
    let payload = first;
    const f = createFixture(t, {getPayload: event => { calls.push(event); return payload; }});
    const event = f.handlePointer('pointerdown', 100, 200, 0);
    payload = {id: 'second'};
    f.handlePointer('pointermove', 110, 210, 0);
    f.handlePointer('pointermove', 120, 220, 0);
    assert.deepEqual(calls, [event]);
    assert.equal(f.engine.getState().payload, first);
    assert.deepEqual(f.engine.getState().origin, {x: 100, y: 200});
    assert.deepEqual(f.engine.getState().point, {x: 120, y: 220});
    assert.deepEqual(f.captureCalls, [0]);
    f.handlePointer('pointerup', 120, 220, 0);
    f.handlePointer('pointerdown', 0, 0, 0);
    f.handlePointer('pointermove', 10, 10, 0);
    assert.equal(calls.length, 2);
    assert.equal(f.engine.getState().payload, payload);
});

for (const [x, y] of [[3, 4], [-3, 4], [3, -4], [-3, -4]]) {
    test(`droppable starts exactly at its radial threshold in direction ${x},${y}`, function (t) {
        const f = createFixture(t, {dragThreshold: 5});
        f.handlePointer('pointerdown', 20, 30);
        f.handlePointer('pointermove', 20 + x * 0.99, 30 + y * 0.99);
        assert.equal(f.engine.getState().dragging, false);
        f.handlePointer('pointermove', 20 + x, 30 + y);
        assert.equal(f.engine.getState().dragging, true);
        assert.deepEqual(f.captureCalls, [1]);
    });
}

for (const dragThreshold of [0, 0.5]) {
    test(`droppable supports a threshold of ${dragThreshold}`, function (t) {
        const f = createFixture(t, {dragThreshold});
        f.handlePointer('pointerdown');
        assert.equal(f.engine.getState().dragging, false);
        f.handlePointer('pointermove', dragThreshold, 0);
        assert.equal(f.engine.getState().dragging, true);
        assert.equal(f.events.length, 2);
    });
}

test('droppable ignores additional presses and foreign pointers while armed and dragging', function (t) {
    let resolutions = 0;
    const f = createFixture(t, {getPayload: () => ++resolutions});
    f.handlePointer('pointerdown');
    f.handlePointer('pointerdown', 50, 50, 2);
    f.handlePointer('pointermove', 50, 50, 2);
    f.handlePointer('pointerup', 50, 50, 2);
    f.handlePointer('pointercancel', 50, 50, 2);
    assert.equal(f.events.length, 1);
    f.handlePointer('pointermove', 10, 10);
    const state = f.engine.getState();
    f.handlePointer('pointerdown', 50, 50, 2);
    f.handlePointer('pointermove', 50, 50, 2);
    f.handlePointer('pointerup', 50, 50, 2);
    f.handlePointer('pointercancel', 50, 50, 2);
    assert.deepEqual(f.engine.getState(), state);
    assert.equal(resolutions, 1);
    assert.equal(f.events.length, 2);
    f.handlePointer('pointercancel');
    assert.equal(f.engine.getState().dragging, false);
});

for (const end of ['pointerup', 'pointercancel']) {
    test(`droppable releases capture once and permits a fresh gesture after ${end}`, function (t) {
        const f = createFixture(t);
        f.createTarget('zone');
        for (const id of [1, 2]) {
            f.handlePointer('pointerdown', 0, 0, id);
            f.handlePointer('pointermove', 10, 10, id);
            f.handlePointer('pointermove', 20, 20, id);
            f.handlePointer(end, 20, 20, id);
            f.handlePointer(end, 20, 20, id);
            assert.deepEqual(f.engine.getState(), f.events[0]);
        }
        assert.deepEqual(f.captureCalls, [1, 2]);
        assert.deepEqual(f.releaseCalls, [1, 2]);
        assert.equal(f.drops.length, end === 'pointerup' ? 2 : 0);
    });
}

test('droppable works without optional pointer capture methods', function (t) {
    const f = createFixture(t);
    delete f.container.setPointerCapture;
    delete f.container.hasPointerCapture;
    delete f.container.releasePointerCapture;
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 10, 10);
    f.handlePointer('pointerup');
    assert.deepEqual(f.engine.getState(), f.events[0]);
    assert.equal(f.events.length, 3);
});

test('droppable does not release capture it no longer holds', function (t) {
    const f = createFixture(t);
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 10, 10);
    f.captures.clear();
    f.handlePointer('pointercancel');
    assert.deepEqual(f.releaseCalls, []);
    assert.deepEqual(f.engine.getState(), f.events[0]);
});
