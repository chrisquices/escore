import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHost, createFixture} from './helpers/draggable.ts';

for (const handle of [null, '.handle']) {
    test(`draggable removes the exact listeners registered on ${handle || 'the element'}`, function (t) {
        const f = createFixture(t, {handle});
        assert.deepEqual(f.target.registrations.map(({type, options}) => ({type, options})), [
            {type: 'pointerdown', options: undefined},
            {type: 'pointermove', options: undefined},
            {type: 'pointerup', options: undefined},
            {type: 'pointercancel', options: undefined},
            {type: 'pointerleave', options: undefined},
        ]);
        f.engine.destroy();
        f.engine.destroy();
        assert.equal(f.target.handlers.size, 0);
        assert.deepEqual(f.target.removals, f.target.registrations);
        assert.equal(f.events.length, 1);
    });
}

for (const phase of ['idle', 'hovering', 'pressed', 'dragging', 'resizing']) {
    test(`draggable destruction during ${phase} settles capture and ignores all saved handlers`, function (t) {
        const f = createFixture(t, {resizable: true});
        const handlers = new Map(f.target.handlers);
        if (phase === 'hovering') f.handlePointer('pointermove', 120, 110);
        if (phase === 'pressed' || phase === 'dragging') f.handlePointer('pointerdown');
        if (phase === 'dragging') f.handlePointer('pointermove', 80, 90);
        if (phase === 'resizing') {
            f.handlePointer('pointerdown', 120, 110);
            f.handlePointer('pointermove', 140, 140);
        }
        const before = f.engine.getState();
        const count = f.events.length;
        f.engine.destroy();
        f.engine.destroy();
        assert.equal(f.target.captures.size, 0);
        assert.deepEqual(f.target.releaseCalls, ['pressed', 'dragging', 'resizing'].includes(phase) ? [1] : []);
        assert.equal(f.events.length, count);
        const state = f.engine.getState();
        assert.equal(state.x, before.x);
        assert.equal(state.y, before.y);
        assert.equal(state.width, before.width);
        assert.equal(state.height, before.height);
        assert.equal(state.dragging, false);
        assert.equal(state.resizing, false);
        assert.equal(state.resizeSide, null);
        assert.equal(state.cursor, '');
        for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave']) {
            handlers.get(type)({type, clientX: 100, clientY: 100, pointerId: 1});
        }
        assert.deepEqual(f.engine.getState(), state);
        assert.equal(f.events.length, count);
        assert.deepEqual(f.target.removals, f.target.registrations);
    });
}

test('draggable public mutators and subscription handles are harmless after destruction', function (t) {
    const f = createFixture(t, {resizable: true});
    const detach = f.engine.subscribe(() => assert.fail('destroyed subscribers must not run'));
    f.engine.destroy();
    const state = f.engine.getState();
    f.engine.setPosition(100, 100);
    f.engine.setPosition(NaN, undefined);
    f.engine.setSize(200, 200);
    f.engine.setSize(NaN, undefined);
    f.engine.setDisabled(true);
    f.engine.setDisabled(null);
    f.engine.reset();
    detach();
    detach();
    f.engine.subscribe(() => assert.fail('late subscribers must not run'))();
    assert.deepEqual(f.engine.getState(), state);
    assert.equal(f.events.length, 1);
});

test('draggable destruction from a subscriber interrupts the active notification', function (t) {
    const f = createFixture(t);
    const later = [];
    f.engine.subscribe(() => f.engine.destroy());
    f.engine.subscribe(state => later.push(state));
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 80, 90);
    assert.equal(later.length, 0);
    assert.equal(f.target.captures.size, 0);
    assert.equal(f.target.handlers.size, 0);
    assert.equal(f.engine.getState().dragging, false);
    assert.equal(f.events.length, 2);
});

test('draggable destruction from onChange during resize prevents later delivery and releases capture', function (t) {
    let engine;
    const f = createFixture(t, {resizable: true, onChange(state) { if (state.resizing) engine.destroy(); }});
    engine = f.engine;
    const later = [];
    engine.subscribe(state => later.push(state));
    f.handlePointer('pointerdown', 120, 110);
    assert.equal(later.length, 0);
    assert.deepEqual(f.target.releaseCalls, [1]);
    assert.equal(engine.getState().resizing, false);
    assert.equal(f.events.length, 2);
});

test('draggable a new gesture started by a settled subscriber survives completion of the old one', function (t) {
    const f = createFixture(t);
    let restarted = false;
    f.engine.subscribe(state => {
        if (!state.dragging && !restarted) {
            restarted = true;
            f.handlePointer('pointerdown', 80, 90, 2);
            f.handlePointer('pointermove', 85, 95, 2);
        }
    });
    const later = [];
    f.engine.subscribe(state => later.push(state));
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 80, 90);
    f.handlePointer('pointerup');
    assert.equal(f.engine.getState().dragging, true);
    assert.equal(f.engine.getState().x, 15);
    assert.equal(f.engine.getState().y, 25);
    assert.deepEqual(f.target.captureCalls, [1, 2]);
    assert.deepEqual(f.target.releaseCalls, [1]);
    assert.equal(later.length, 2);
    assert.equal(later[1].dragging, true);
    f.handlePointer('pointerup', 85, 95, 2);
    assert.equal(f.engine.getState().dragging, false);
});

test('draggable instances keep geometry, documents, captures and teardown independent', function (t) {
    const first = createFixture(t, {resizable: true, bounds: 'viewport'});
    const second = createFixture(t, {resizable: true, bounds: 'viewport'}, createHost({left: 40, top: 50}));
    first.viewport.innerWidth = 200;
    second.viewport.innerWidth = 500;
    first.engine.setPosition(1000, 0);
    second.engine.setPosition(1000, 0);
    assert.equal(first.engine.getState().x, 80);
    assert.equal(second.engine.getState().x, 360);
    first.handlePointer('pointerdown', 150, 70);
    first.engine.destroy();
    assert.equal(first.target.captures.size, 0);
    assert.equal(second.target.handlers.size, 5);
    second.engine.reset();
    second.handlePointer('pointerdown', 90, 90);
    second.handlePointer('pointermove', 100, 100);
    assert.equal(second.engine.getState().dragging, true);
    assert.equal(second.engine.getState().x, 10);
    assert.equal(first.engine.getState().x, 80);
});
