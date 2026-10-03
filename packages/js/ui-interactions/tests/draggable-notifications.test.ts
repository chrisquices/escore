import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture, geometry} from './helpers/draggable.ts';

test('draggable subscription and state reads are silent until a synchronous change', function (t) {
    const f = createFixture(t);
    const received = [];
    f.engine.subscribe(state => received.push(state));
    assert.deepEqual(f.engine.getState(), f.events[0]);
    assert.equal(received.length, 0);
    f.engine.setPosition(10, 20);
    assert.equal(received.length, 1);
    assert.equal(received[0].transform, 'translate(10px, 20px)');
    const later = [];
    f.engine.subscribe(state => later.push(state));
    f.engine.setPosition(10, 20);
    assert.equal(later.length, 0);
    f.engine.setPosition(20, 30);
    assert.equal(received.length, 2);
    assert.equal(later.length, 1);
});

test('draggable no-op setters, idle pointers, repeated moves and settled gestures stay silent', function (t) {
    const f = createFixture(t, {resizable: true});
    f.engine.reset();
    f.engine.setPosition(0, 0);
    f.engine.setSize(100, 80);
    f.engine.setDisabled(false);
    f.handlePointer('pointermove');
    f.handlePointer('pointerleave');
    f.handlePointer('pointerup');
    f.handlePointer('pointercancel');
    assert.equal(f.events.length, 1);
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 71, 71);
    f.handlePointer('pointerup');
    assert.equal(f.events.length, 1);
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 80, 90);
    assert.equal(f.events.length, 2);
    f.handlePointer('pointermove', 80, 90);
    assert.equal(f.events.length, 2);
    f.handlePointer('pointerup');
    assert.equal(f.events.length, 3);
    f.handlePointer('pointerup');
    assert.equal(f.events.length, 3);
});

test('draggable suppresses position changes removed by axis constraints or bounds clamping', function (t) {
    const f = createFixture(t, {axis: 'x', bounds: 'parent'});
    f.engine.setPosition(0, 100);
    assert.equal(f.events.length, 1);
    f.engine.setPosition(1000, 100);
    assert.equal(f.events.length, 2);
    f.engine.setPosition(2000, 200);
    assert.equal(f.events.length, 2);
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 1070, 70);
    assert.equal(f.events.length, 3);
    assert.equal(f.engine.getState().dragging, true);
    f.handlePointer('pointermove', 2070, 70);
    assert.equal(f.events.length, 3);
});

test('draggable retains raw sub-cent position changes while suppressing identical rounded state', function (t) {
    const f = createFixture(t, {threshold: 0});
    f.engine.setPosition(10.001, 20.001);
    f.engine.setPosition(10.004, 20.004);
    assert.equal(f.events.length, 2);
    assert.equal(f.engine.getState().transform, 'translate(10px, 20px)');
    f.handlePointer('pointerdown', 70, 70);
    f.handlePointer('pointermove', 70.002, 70.002);
    assert.equal(f.engine.getState().transform, 'translate(10.01px, 20.01px)');
    assert.equal(f.events.length, 3);
    f.handlePointer('pointermove', 70.003, 70.003);
    assert.equal(f.events.length, 3);
});

test('draggable retains raw sub-cent size changes while suppressing identical rounded state', function (t) {
    const f = createFixture(t, {resizable: true});
    f.engine.setSize(100.001, 80.001);
    f.engine.setSize(100.004, 80.004);
    assert.equal(f.events.length, 1);
    f.handlePointer('pointerdown', 120, 110);
    f.handlePointer('pointermove', 120.002, 110.002);
    assert.deepEqual(geometry(f.engine), {x: 0, y: 0, width: 100.01, height: 80.01});
    assert.equal(f.events.length, 3);
    f.handlePointer('pointermove', 120.003, 110.003);
    assert.equal(f.events.length, 3);
});

test('draggable suppresses repeated resize and setSize clamping without suppressing resize start/end', function (t) {
    const f = createFixture(t, {resizable: true, maxWidth: 120, maxHeight: 100});
    f.engine.setSize(1000, 1000);
    assert.equal(f.events.length, 2);
    f.engine.setSize(2000, 2000);
    assert.equal(f.events.length, 2);
    f.handlePointer('pointerdown', 140, 130);
    assert.equal(f.events.length, 3);
    f.handlePointer('pointermove', 1140, 1130);
    f.handlePointer('pointermove', 2140, 2130);
    assert.equal(f.events.length, 3);
    f.handlePointer('pointerup');
    assert.equal(f.events.length, 4);
});

test('draggable hover changes notify only when the rendered cursor changes', function (t) {
    const f = createFixture(t, {resizable: true});
    f.handlePointer('pointermove', 70, 30);
    assert.equal(f.events.length, 2);
    f.handlePointer('pointermove', 70, 30);
    f.handlePointer('pointermove', 70, 110);
    assert.equal(f.events.length, 2);
    f.handlePointer('pointermove', 20, 30);
    assert.equal(f.events.length, 3);
    f.handlePointer('pointermove', 120, 110);
    assert.equal(f.events.length, 3);
    f.handlePointer('pointermove', 120, 30);
    f.handlePointer('pointermove', 20, 110);
    assert.equal(f.events.length, 4);
    f.handlePointer('pointermove', 120, 70);
    f.handlePointer('pointermove', 20, 70);
    assert.equal(f.events.length, 5);
    f.handlePointer('pointerleave');
    assert.equal(f.events.length, 6);
    assert.equal(f.events[5].cursor, '');
    f.handlePointer('pointerleave');
    assert.equal(f.events.length, 6);
});

test('draggable leaving during resize clears latent hover without changing the active cursor', function (t) {
    const f = createFixture(t, {resizable: true});
    f.handlePointer('pointermove', 120, 110);
    f.handlePointer('pointerdown', 120, 110);
    assert.equal(f.events.length, 3);
    f.handlePointer('pointerleave');
    assert.equal(f.events.length, 3);
    assert.equal(f.engine.getState().cursor, 'nwse-resize');
    f.handlePointer('pointerup');
    assert.equal(f.events.length, 4);
    assert.equal(f.engine.getState().cursor, '');
});

test('draggable notifications never serialize state', function (t) {
    const stringify = t.mock.method(JSON, 'stringify', () => assert.fail('state must not be serialized'));
    const f = createFixture(t, {resizable: true});
    f.engine.setPosition(10, 20);
    f.engine.setSize(120, 100);
    f.engine.reset();
    f.handlePointer('pointermove', 140, 130);
    f.handlePointer('pointerdown', 140, 130);
    f.handlePointer('pointermove', 150, 140);
    f.handlePointer('pointerup');
    f.engine.setDisabled(true);
    assert.equal(stringify.mock.callCount(), 0);
    stringify.mock.restore();
    assert.equal(f.events.length, 9);
});

test('draggable isolates throwing initial and later consumers without interrupting other subscribers', function (t) {
    const errors = t.mock.method(console, 'error', () => {});
    const f = createFixture(t, {onChange: () => { throw new Error('onChange failed'); }});
    assert.equal(errors.mock.callCount(), 1);
    const later = [];
    const detach = f.engine.subscribe(() => { throw new Error('subscriber failed'); });
    f.engine.subscribe(state => later.push(state));
    f.engine.setPosition(10, 20);
    assert.equal(errors.mock.callCount(), 3);
    assert.equal(later.length, 1);
    assert.equal(later[0].x, 10);
    detach();
    f.engine.setPosition(20, 30);
    assert.equal(errors.mock.callCount(), 4);
    assert.equal(later.length, 2);
});

test('draggable duplicate subscriptions deliver once and either unsubscribe handle removes the listener', function (t) {
    const f = createFixture(t);
    const received = [];
    const listener = state => received.push(state);
    const first = f.engine.subscribe(listener);
    const second = f.engine.subscribe(listener);
    f.engine.setPosition(1, 2);
    assert.equal(received.length, 1);
    second();
    f.engine.setPosition(2, 3);
    assert.equal(received.length, 1);
    f.engine.subscribe(listener);
    f.engine.setPosition(3, 4);
    assert.equal(received.length, 2);
    first();
    first();
    f.engine.setPosition(4, 5);
    assert.equal(received.length, 2);
});

test('draggable honors unsubscription during delivery and later resubscription', function (t) {
    const f = createFixture(t);
    const received = [];
    let detach;
    const stop = f.engine.subscribe(() => detach());
    const listener = state => received.push(state);
    detach = f.engine.subscribe(listener);
    f.engine.setPosition(1, 2);
    assert.equal(received.length, 0);
    stop();
    f.engine.subscribe(listener);
    f.engine.setPosition(2, 3);
    assert.equal(received.length, 1);
});

test('draggable reentrant changes supersede stale deliveries to later subscribers', function (t) {
    const f = createFixture(t);
    const later = [];
    f.engine.subscribe(state => { if (state.x === 10) f.engine.setPosition(20, 30); });
    f.engine.subscribe(state => later.push(state));
    f.engine.setPosition(10, 10);
    assert.equal(later.length, 1);
    assert.equal(later[0].transform, 'translate(20px, 30px)');
    assert.deepEqual(later[0], f.engine.getState());
});

test('draggable reentrant changes back to the prior state still deliver the final state', function (t) {
    const f = createFixture(t);
    const later = [];
    f.engine.subscribe(state => { if (state.x === 10) f.engine.reset(); });
    f.engine.subscribe(state => later.push(state));
    f.engine.setPosition(10, 20);
    assert.equal(later.length, 1);
    assert.deepEqual(later[0], f.events[0]);
    assert.deepEqual(f.events.map(state => state.x), [0, 10, 0]);
});

test('draggable reentrant no-op changes do not recurse or starve later subscribers', function (t) {
    const f = createFixture(t, {resizable: true});
    const later = [];
    f.engine.subscribe(state => {
        f.engine.setPosition(state.x + 0.001, state.y + 0.001);
        f.engine.setSize(state.width + 0.001, state.height + 0.001);
        f.engine.setDisabled(state.disabled);
    });
    f.engine.subscribe(state => later.push(state));
    f.engine.setPosition(10, 20);
    assert.equal(later.length, 1);
    assert.deepEqual(later[0], f.engine.getState());
    assert.equal(f.events.length, 2);
});

test('draggable reentrant disabling settles a live gesture before later consumers run', function (t) {
    const f = createFixture(t);
    const later = [];
    f.engine.subscribe(state => { if (state.dragging) f.engine.setDisabled(true); });
    f.engine.subscribe(state => later.push(state));
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 80, 90);
    assert.equal(later.length, 1);
    assert.equal(later[0].dragging, false);
    assert.equal(later[0].disabled, true);
    assert.equal(f.target.captures.size, 0);
});

test('draggable gives every consumer an independent scalar snapshot and getState stays fresh', function (t) {
    const f = createFixture(t, {resizable: true, onChange(state) { state.x = 900; state.width = 999; }});
    const received = [];
    f.engine.subscribe(state => {
        state.x = 700;
        state.y = 800;
        state.disabled = true;
        state.transform = 'corrupted';
        state.cursor = 'corrupted';
        state.width = 500;
    });
    f.engine.subscribe(state => received.push(state));
    f.engine.setPosition(10, 20);
    const expected = f.engine.getState();
    assert.equal(expected.x, 10);
    assert.equal(expected.width, 100);
    assert.equal(expected.disabled, false);
    assert.deepEqual(received[0], expected);
    assert.notEqual(received[0], f.events[1]);
    assert.notEqual(expected, f.engine.getState());
    received[0].width = 700;
    expected.x = 700;
    assert.equal(f.engine.getState().x, 10);
    assert.equal(f.engine.getState().width, 100);
    const count = f.events.length;
    f.engine.setPosition(10, 20);
    assert.equal(f.events.length, count);
});
