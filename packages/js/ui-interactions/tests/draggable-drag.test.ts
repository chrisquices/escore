import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHost, createFixture} from './helpers/draggable.ts';

test('draggable captures a press immediately and crosses the radial threshold inclusively', function (t) {
    const f = createFixture(t);
    f.handlePointer('pointerdown', 70, 70, 7);
    assert.deepEqual(f.target.captureCalls, [7]);
    assert.equal(f.engine.getState().dragging, false);
    f.handlePointer('pointermove', 72, 73, 7);
    assert.equal(f.events.length, 1);
    f.handlePointer('pointermove', 73, 74, 7);
    assert.equal(f.engine.getState().dragging, true);
    assert.equal(f.engine.getState().x, 3);
    assert.equal(f.engine.getState().y, 4);
    f.handlePointer('pointermove', 69, 69, 7);
    assert.equal(f.engine.getState().x, -1);
    assert.equal(f.engine.getState().y, -1);
    f.handlePointer('pointerup', 69, 69, 7);
    assert.equal(f.engine.getState().dragging, false);
    assert.deepEqual(f.target.releaseCalls, [7]);
    assert.equal(f.target.captures.size, 0);
});

test('draggable zero threshold still waits for a move, including a stationary move', function (t) {
    const f = createFixture(t, {threshold: 0});
    f.handlePointer('pointerdown');
    assert.equal(f.engine.getState().dragging, false);
    f.handlePointer('pointermove');
    assert.equal(f.engine.getState().dragging, true);
    assert.equal(f.engine.getState().x, 0);
    f.handlePointer('pointerup');
    assert.equal(f.events.length, 3);
});

for (const axis of ['x', 'y']) {
    test(`draggable ${axis} axis ignores perpendicular movement for threshold and position`, function (t) {
        const f = createFixture(t, {axis});
        f.handlePointer('pointerdown', 70, 70);
        f.handlePointer('pointermove', axis === 'x' ? 74 : 170, axis === 'y' ? 74 : 170);
        assert.equal(f.events.length, 1);
        f.handlePointer('pointermove', axis === 'x' ? 75 : 170, axis === 'y' ? 75 : 170);
        assert.equal(f.engine.getState().dragging, true);
        assert.equal(f.engine.getState().x, axis === 'x' ? 5 : 0);
        assert.equal(f.engine.getState().y, axis === 'y' ? 5 : 0);
        f.handlePointer('pointerup');
        f.engine.setPosition(20, 30);
        assert.equal(f.engine.getState().x, axis === 'x' ? 20 : 0);
        assert.equal(f.engine.getState().y, axis === 'y' ? 30 : 0);
        f.engine.reset();
        assert.equal(f.engine.getState().transform, 'translate(0px, 0px)');
    });
}

test('draggable ignores competing presses, moves and releases until the owning pointer ends', function (t) {
    const f = createFixture(t);
    f.handlePointer('pointerdown', 70, 70, 1);
    f.handlePointer('pointerdown', 100, 100, 2);
    f.handlePointer('pointermove', 110, 110, 2);
    f.handlePointer('pointerup', 110, 110, 2);
    f.handlePointer('pointercancel', 110, 110, 2);
    assert.equal(f.events.length, 1);
    assert.deepEqual(f.target.captureCalls, [1]);
    assert.equal(f.target.captures.has(1), true);
    f.handlePointer('pointermove', 80, 90, 1);
    assert.equal(f.engine.getState().x, 10);
    assert.equal(f.engine.getState().y, 20);
    f.handlePointer('pointerup', 80, 90, 1);
    f.handlePointer('pointerdown', 80, 90, 2);
    f.handlePointer('pointermove', 85, 95, 2);
    assert.equal(f.engine.getState().x, 15);
    assert.equal(f.engine.getState().y, 25);
    assert.deepEqual(f.target.captureCalls, [1, 2]);
});

for (const event of ['pointerup', 'pointercancel']) {
    test(`draggable ${event} settles a drag without resetting its position`, function (t) {
        const f = createFixture(t);
        f.handlePointer('pointerdown');
        f.handlePointer('pointermove', 90, 100);
        f.handlePointer(event, 90, 100);
        assert.equal(f.engine.getState().dragging, false);
        assert.equal(f.engine.getState().transform, 'translate(20px, 30px)');
        assert.equal(f.events.length, 3);
        f.handlePointer('pointermove', 100, 110);
        f.handlePointer(event);
        assert.equal(f.events.length, 3);
        assert.deepEqual(f.target.releaseCalls, [1]);
    });

    test(`draggable ${event} ends a below-threshold press silently`, function (t) {
        const f = createFixture(t);
        f.handlePointer('pointerdown');
        f.handlePointer('pointermove', 71, 71);
        f.handlePointer(event);
        assert.equal(f.events.length, 1);
        assert.equal(f.target.captures.size, 0);
    });
}

test('draggable tolerates capture already released before pointerup', function (t) {
    const f = createFixture(t);
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 80, 80);
    f.target.captures.clear();
    f.handlePointer('pointerup');
    assert.deepEqual(f.target.releaseCalls, []);
    assert.equal(f.engine.getState().dragging, false);
});

for (const handleKind of ['selector', 'element', 'missing selector']) {
    test(`draggable routes all pointer events and capture through a ${handleKind} handle`, function (t) {
        const host = createHost();
        const handle = handleKind === 'selector' ? '.handle' : handleKind === 'element' ? host.handle : '.missing';
        const f = createFixture(t, {handle}, host);
        const expected = handleKind === 'missing selector' ? host.element : host.handle;
        const inactive = expected === host.element ? host.handle : host.element;
        assert.equal(f.target, expected);
        assert.equal(expected.handlers.size, 5);
        assert.equal(inactive.handlers.size, 0);
        assert.deepEqual(host.queries, handleKind === 'element' ? [] : [handle]);
        inactive.handlePointer('pointerdown');
        inactive.handlePointer('pointermove', 100, 100);
        assert.equal(f.events.length, 1);
        f.handlePointer('pointerdown');
        f.handlePointer('pointermove', 80, 90);
        assert.equal(f.engine.getState().transform, 'translate(10px, 20px)');
        assert.deepEqual(expected.captureCalls, [1]);
    });
}

for (const phase of ['idle', 'pressed', 'dragging']) {
    test(`draggable disabling while ${phase} cancels capture and can resume`, function (t) {
        const f = createFixture(t);
        if (phase !== 'idle') f.handlePointer('pointerdown');
        if (phase === 'dragging') f.handlePointer('pointermove', 80, 90);
        const {x, y} = f.engine.getState();
        f.engine.setDisabled(true);
        assert.equal(f.engine.getState().disabled, true);
        assert.equal(f.engine.getState().canDrag, false);
        assert.equal(f.engine.getState().dragging, false);
        assert.equal(f.target.captures.size, 0);
        const count = f.events.length;
        f.handlePointer('pointerdown');
        f.handlePointer('pointermove', 100, 100);
        f.handlePointer('pointerup');
        f.engine.setDisabled(true);
        assert.equal(f.events.length, count);
        f.engine.setDisabled(false);
        f.handlePointer('pointerdown');
        f.handlePointer('pointermove', 75, 76);
        assert.equal(f.engine.getState().x, x + 5);
        assert.equal(f.engine.getState().y, y + 6);
    });
}

test('draggable setPosition and reset render rounded offsets and remain usable while disabled', function (t) {
    const f = createFixture(t, {disabled: true});
    f.engine.setPosition(12.346, -5.674);
    assert.equal(f.engine.getState().transform, 'translate(12.35px, -5.67px)');
    assert.equal(f.element.getBoundingClientRect().left, 32.35);
    f.engine.reset();
    assert.equal(f.engine.getState().transform, 'translate(0px, 0px)');
    assert.equal(f.element.getBoundingClientRect().left, 20);
});

for (const mode of ['none', 'parent', 'viewport', 'element', 'rect']) {
    test(`draggable clamps programmatic and pointer movement using ${mode} bounds`, function (t) {
        const host = createHost();
        const rect = {left: 10, top: 15, right: 240, bottom: 180};
        const bounds = mode === 'element' ? {getBoundingClientRect: () => rect} : mode === 'rect' ? rect : mode;
        const f = createFixture(t, {bounds}, host);
        const min = mode === 'none' ? [-1000, -1000] : mode === 'parent' || mode === 'viewport' ? [-20, -30] : [-10, -15];
        const max = mode === 'none' ? [1000, 1000] : mode === 'parent' ? [180, 110] : mode === 'viewport' ? [200, 130] : [120, 70];
        assert.equal(f.engine.getState().boundsMode, ['element', 'rect'].includes(mode) ? 'custom' : mode);
        f.engine.setPosition(-1000, -1000);
        assert.equal(f.engine.getState().x, min[0]);
        assert.equal(f.engine.getState().y, min[1]);
        f.engine.setPosition(1000, 1000);
        assert.equal(f.engine.getState().x, max[0]);
        assert.equal(f.engine.getState().y, max[1]);
        f.engine.reset();
        f.handlePointer('pointerdown', 70, 70);
        f.handlePointer('pointermove', 1070, 1070);
        assert.equal(f.engine.getState().x, max[0]);
        assert.equal(f.engine.getState().y, max[1]);
        f.handlePointer('pointermove', -930, -930);
        assert.equal(f.engine.getState().x, min[0]);
        assert.equal(f.engine.getState().y, min[1]);
    });
}

test('draggable reads changing parent and host document viewport bounds', function (t) {
    for (const bounds of ['parent', 'viewport']) {
        const f = createFixture(t, {bounds});
        f.handlePointer('pointerdown');
        f.handlePointer('pointermove', 1000, 1000);
        if (bounds === 'parent') {
            f.parentRect.right = 160;
            f.parentRect.bottom = 140;
        } else {
            f.viewport.innerWidth = 160;
            f.viewport.innerHeight = 140;
        }
        f.handlePointer('pointermove', 1000, 1000);
        assert.equal(f.engine.getState().x, 40);
        assert.equal(f.engine.getState().y, 30);
        f.handlePointer('pointermove', 80, 80);
        assert.equal(f.engine.getState().x, 10);
        assert.equal(f.engine.getState().y, 10);
    }
});

test('draggable falls back to unbounded movement when parent bounds have no parent', function (t) {
    const host = createHost();
    host.element.parentElement = null;
    const f = createFixture(t, {bounds: 'parent'}, host);
    f.engine.setPosition(-1000, 1000);
    assert.equal(f.engine.getState().x, -1000);
    assert.equal(f.engine.getState().y, 1000);
});

test('draggable aligns an oversized element with the bounds top-left', function (t) {
    const f = createFixture(t, {bounds: 'parent'}, createHost({width: 400, height: 300}));
    f.engine.setPosition(1000, 1000);
    assert.equal(f.engine.getState().x, -20);
    assert.equal(f.engine.getState().y, -30);
    assert.equal(f.element.getBoundingClientRect().left, 0);
    assert.equal(f.element.getBoundingClientRect().top, 0);
    f.engine.reset();
    assert.equal(f.events.length, 2);
    assert.equal(f.engine.getState().transform, 'translate(-20px, -30px)');
});
