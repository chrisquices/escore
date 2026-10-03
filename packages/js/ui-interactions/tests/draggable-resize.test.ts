import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHost, createFixture, geometry, resizePoints} from './helpers/draggable.ts';

const cursors = {nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize', e: 'ew-resize', se: 'nwse-resize', s: 'ns-resize', sw: 'nesw-resize', w: 'ew-resize'};
const resized = {
    nw: {x: 10, y: 20, width: 90, height: 60}, n: {x: 0, y: 20, width: 100, height: 60},
    ne: {x: 0, y: 20, width: 110, height: 60}, e: {x: 0, y: 0, width: 110, height: 80},
    se: {x: 0, y: 0, width: 110, height: 100}, s: {x: 0, y: 0, width: 100, height: 100},
    sw: {x: 10, y: 0, width: 90, height: 100}, w: {x: 10, y: 0, width: 90, height: 80},
};

for (const [side, [clientX, clientY]] of Object.entries(resizePoints)) {
    test(`draggable ${side} resize reports its cursor, anchors the opposite edges and settles`, function (t) {
        const f = createFixture(t, {resizable: true, threshold: 100});
        f.handlePointer('pointermove', clientX, clientY);
        assert.equal(f.engine.getState().cursor, cursors[side]);
        f.handlePointer('pointerdown', clientX, clientY);
        assert.equal(f.engine.getState().resizing, true);
        assert.equal(f.engine.getState().resizeSide, side);
        assert.equal(f.engine.getState().dragging, false);
        f.handlePointer('pointermove', clientX + 10, clientY + 20);
        assert.deepEqual(geometry(f.engine), resized[side]);
        const rect = f.element.getBoundingClientRect();
        assert.equal(rect.width, resized[side].width);
        assert.equal(rect.left, 20 + resized[side].x);
        f.handlePointer('pointerup', clientX + 10, clientY + 20);
        assert.equal(f.engine.getState().resizing, false);
        assert.equal(f.engine.getState().resizeSide, null);
        assert.equal(f.target.captures.size, 0);
        f.handlePointer('pointerleave');
        assert.equal(f.engine.getState().cursor, '');
    });
}

test('draggable resize handles and edge width restrict resize hit testing', function (t) {
    const f = createFixture(t, {resizable: true, resizeHandles: ['e'], resizeEdgeSize: 5});
    f.handlePointer('pointermove', 114, 70);
    assert.equal(f.engine.getState().cursor, '');
    f.handlePointer('pointermove', 115, 70);
    assert.equal(f.engine.getState().cursor, 'ew-resize');
    f.handlePointer('pointermove', 120, 30);
    assert.equal(f.engine.getState().cursor, '');
    f.handlePointer('pointerdown', 120, 30);
    assert.equal(f.engine.getState().resizing, false);
    f.handlePointer('pointermove', 130, 40);
    assert.equal(f.engine.getState().dragging, true);
    assert.equal(f.engine.getState().width, 100);
    f.handlePointer('pointerup');
    f.engine.reset();
    f.handlePointer('pointerdown', 115, 70);
    assert.equal(f.engine.getState().resizeSide, 'e');
});

test('draggable resizable elements still drag through their center or with no resize handles', function (t) {
    for (const resizeHandles of [undefined, []]) {
        const f = createFixture(t, {resizable: true, resizeHandles});
        const point = resizeHandles ? [20, 30] : [70, 70];
        f.handlePointer('pointerdown', ...point);
        f.handlePointer('pointermove', point[0] + 10, point[1] + 20);
        assert.equal(f.engine.getState().dragging, true);
        assert.equal(f.engine.getState().resizing, false);
        assert.deepEqual(geometry(f.engine), {x: 10, y: 20, width: 100, height: 80});
    }
});

test('draggable resizing remains independent of the drag axis', function (t) {
    for (const axis of ['x', 'y']) {
        const f = createFixture(t, {resizable: true, axis});
        f.handlePointer('pointerdown', 20, 30);
        f.handlePointer('pointermove', 30, 50);
        assert.deepEqual(geometry(f.engine), {x: 10, y: 20, width: 90, height: 60});
    }
});

test('draggable resize ignores foreign pointers and cancellation preserves the resized box', function (t) {
    const f = createFixture(t, {resizable: true});
    f.handlePointer('pointerdown', 120, 110, 7);
    f.handlePointer('pointerdown', 20, 30, 8);
    f.handlePointer('pointermove', 200, 200, 8);
    f.handlePointer('pointerup', 200, 200, 8);
    f.handlePointer('pointercancel', 200, 200, 8);
    assert.deepEqual(geometry(f.engine), {x: 0, y: 0, width: 100, height: 80});
    assert.equal(f.engine.getState().resizing, true);
    assert.deepEqual(f.target.captureCalls, [7]);
    f.handlePointer('pointermove', 140, 140, 7);
    f.handlePointer('pointercancel', 140, 140, 7);
    assert.deepEqual(geometry(f.engine), {x: 0, y: 0, width: 120, height: 110});
    assert.equal(f.engine.getState().resizing, false);
    assert.deepEqual(f.target.releaseCalls, [7]);
    f.handlePointer('pointermove', 70, 70, 7);
    assert.equal(f.engine.getState().cursor, '');
});

test('draggable disabling during resize clears capture and hover and can start a fresh resize', function (t) {
    const f = createFixture(t, {resizable: true});
    f.handlePointer('pointermove', 120, 110);
    f.handlePointer('pointerdown', 120, 110);
    f.handlePointer('pointermove', 140, 130);
    f.engine.setDisabled(true);
    assert.equal(f.engine.getState().resizing, false);
    assert.equal(f.engine.getState().resizeSide, null);
    assert.equal(f.engine.getState().cursor, '');
    assert.equal(f.engine.getState().canResize, false);
    assert.equal(f.target.captures.size, 0);
    const count = f.events.length;
    f.handlePointer('pointermove', 140, 130);
    f.handlePointer('pointerdown', 140, 130);
    assert.equal(f.events.length, count);
    f.engine.setDisabled(false);
    f.handlePointer('pointerdown', 140, 130);
    f.handlePointer('pointermove', 150, 140);
    assert.deepEqual(geometry(f.engine), {x: 0, y: 0, width: 130, height: 110});
});

test('draggable resize clamps each dimension to its min/max and retains the opposite corner', function (t) {
    const f = createFixture(t, {resizable: true, minWidth: 60, minHeight: 40, maxWidth: 150, maxHeight: 120});
    f.handlePointer('pointerdown', 20, 30);
    f.handlePointer('pointermove', 520, 530);
    assert.deepEqual(geometry(f.engine), {x: 40, y: 40, width: 60, height: 40});
    assert.equal(f.element.getBoundingClientRect().right, 120);
    assert.equal(f.element.getBoundingClientRect().bottom, 110);
    f.handlePointer('pointermove', -480, -470);
    assert.deepEqual(geometry(f.engine), {x: -50, y: -40, width: 150, height: 120});
    assert.equal(f.element.getBoundingClientRect().right, 120);
    assert.equal(f.element.getBoundingClientRect().bottom, 110);
});

for (const aspectRatio of ['auto', 2]) {
    for (const side of ['e', 's', 'nw']) {
        test(`draggable ${aspectRatio} aspect ratio follows the ${side} resize dimension`, function (t) {
            const f = createFixture(t, {resizable: true, aspectRatio}, createHost({width: 100, height: 50}));
            const start = side === 'e' ? [120, 55] : side === 's' ? [70, 80] : [20, 30];
            const end = side === 'e' ? [160, 90] : side === 's' ? [170, 100] : [-20, 20];
            f.handlePointer('pointerdown', ...start);
            f.handlePointer('pointermove', ...end);
            assert.deepEqual(geometry(f.engine), {x: side === 'nw' ? -40 : 0, y: side === 'nw' ? -20 : 0, width: 140, height: 70});
        });
    }
}

test('draggable numeric portrait aspect ratio couples width and height', function (t) {
    const f = createFixture(t, {resizable: true, aspectRatio: 0.5});
    f.handlePointer('pointerdown', 120, 70);
    f.handlePointer('pointermove', 140, 70);
    assert.deepEqual(geometry(f.engine), {x: 0, y: 0, width: 120, height: 240});
});

test('draggable auto aspect ratio is captured anew for successive resize gestures', function (t) {
    const f = createFixture(t, {resizable: true, aspectRatio: 'auto'});
    f.engine.setSize(80, 40);
    f.handlePointer('pointerdown', 100, 50);
    f.handlePointer('pointermove', 140, 50);
    f.handlePointer('pointerup');
    assert.deepEqual(geometry(f.engine), {x: 0, y: 0, width: 120, height: 60});
    f.engine.setSize(60, 60);
    f.handlePointer('pointerdown', 80, 60);
    f.handlePointer('pointermove', 100, 60);
    assert.deepEqual(geometry(f.engine), {x: 0, y: 0, width: 80, height: 80});
});

for (const side of ['e', 's']) {
    test(`draggable aspect-constrained ${side} resize honors combined min/max dimensions`, function (t) {
        const f = createFixture(t, {resizable: true, aspectRatio: 2, minWidth: 80, minHeight: 60, maxWidth: 300, maxHeight: 120});
        const start = resizePoints[side];
        f.handlePointer('pointerdown', ...start);
        f.handlePointer('pointermove', start[0] - 1000, start[1] - 1000);
        assert.deepEqual(geometry(f.engine), {x: 0, y: 0, width: 120, height: 60});
        f.handlePointer('pointermove', start[0] + 1000, start[1] + 1000);
        assert.deepEqual(geometry(f.engine), {x: 0, y: 0, width: 240, height: 120});
    });
}

for (const mode of ['none', 'parent', 'viewport', 'element', 'rect']) {
    test(`draggable southeast resize uses ${mode} bounds from a translated box`, function (t) {
        const rect = {left: 0, top: 0, right: 240, bottom: 180};
        const bounds = mode === 'element' ? {getBoundingClientRect: () => rect} : mode === 'rect' ? rect : mode;
        const f = createFixture(t, {resizable: true, bounds});
        f.engine.setPosition(10, 20);
        f.handlePointer('pointerdown', 130, 130);
        f.handlePointer('pointermove', 1130, 1130);
        const size = mode === 'none' ? [1100, 1080] : mode === 'parent' ? [270, 170] : mode === 'viewport' ? [290, 190] : [210, 130];
        assert.deepEqual(geometry(f.engine), {x: 10, y: 20, width: size[0], height: size[1]});
    });
}

test('draggable northwest resize keeps opposite edges fixed while moving within bounds', function (t) {
    const f = createFixture(t, {resizable: true, bounds: 'parent'});
    f.engine.setPosition(50, 60);
    f.handlePointer('pointerdown', 70, 90);
    f.handlePointer('pointermove', 40, 50);
    assert.deepEqual(geometry(f.engine), {x: 20, y: 20, width: 130, height: 120});
    assert.equal(f.element.getBoundingClientRect().right, 170);
    assert.equal(f.element.getBoundingClientRect().bottom, 170);
});

test('draggable preserves a feasible aspect ratio when an east resize reaches its bounds', function (t) {
    const f = createFixture(t, {
        resizable: true, aspectRatio: 2, bounds: {left: 0, top: 0, right: 200, bottom: 200},
    }, createHost({left: 50, top: 50, width: 100, height: 50}));
    f.handlePointer('pointerdown', 150, 75);
    f.handlePointer('pointermove', 350, 75);
    assert.deepEqual(geometry(f.engine), {x: 0, y: 0, width: 150, height: 75});
});

const boundedGestures = {
    w: {start: [50, 75], end: [-150, 75], expected: {x: -50, y: 0, width: 150, height: 50}},
    n: {start: [100, 50], end: [100, -150], expected: {x: 0, y: -50, width: 100, height: 100}},
    nw: {start: [50, 50], end: [-150, -150], expected: {x: -50, y: -50, width: 150, height: 100}},
    ne: {start: [150, 50], end: [350, -150], expected: {x: 0, y: -50, width: 150, height: 100}},
    sw: {start: [50, 100], end: [-150, 300], expected: {x: -50, y: 0, width: 150, height: 150}},
};

for (const [side, {start, end, expected}] of Object.entries(boundedGestures)) {
    test(`draggable ${side} resize preserves opposite edges when it reaches a bound`, function (t) {
        const f = createFixture(t, {
            resizable: true, bounds: {left: 0, top: 0, right: 200, bottom: 200},
        }, createHost({left: 50, top: 50, width: 100, height: 50}));
        f.handlePointer('pointerdown', ...start);
        f.handlePointer('pointermove', ...end);
        assert.deepEqual(geometry(f.engine), expected);
        const rect = f.element.getBoundingClientRect();
        if (side.includes('w')) assert.equal(rect.right, 150);
        if (side.includes('n')) assert.equal(rect.bottom, 100);
        assert.ok(rect.left >= 0 && rect.top >= 0 && rect.right <= 200 && rect.bottom <= 200);
        const count = f.events.length;
        f.handlePointer('pointermove', ...end);
        assert.equal(f.events.length, count);
    });
}

for (const aspectRatio of [2, 'auto']) {
    for (const [side, {start, end}] of Object.entries(boundedGestures)) {
        test(`draggable ${side} resize preserves feasible ${aspectRatio} aspect and anchored edges at bounds`, function (t) {
            const f = createFixture(t, {
                resizable: true, aspectRatio, minWidth: 80, minHeight: 40, maxWidth: 200, maxHeight: 100,
                bounds: {left: 0, top: 0, right: 200, bottom: 200},
            }, createHost({left: 50, top: 50, width: 100, height: 50}));
            f.handlePointer('pointerdown', ...start);
            f.handlePointer('pointermove', ...end);
            assert.deepEqual(geometry(f.engine), {x: side.includes('w') ? -50 : 0, y: side.includes('n') ? -25 : 0, width: 150, height: 75});
            const rect = f.element.getBoundingClientRect();
            assert.equal(rect.width / rect.height, 2);
            if (side.includes('w')) assert.equal(rect.right, 150);
            if (side.includes('n')) assert.equal(rect.bottom, 100);
            assert.ok(rect.left >= 0 && rect.top >= 0 && rect.right <= 200 && rect.bottom <= 200);
        });
    }
}

test('draggable setSize applies independent min/max limits and reports rounded dimensions', function (t) {
    const f = createFixture(t, {resizable: true, minWidth: 40, minHeight: 30, maxWidth: 160, maxHeight: 120});
    f.engine.setPosition(10, 20);
    f.engine.setSize(-1, 1000);
    assert.deepEqual(geometry(f.engine), {x: 10, y: 20, width: 40, height: 120});
    f.engine.setSize(99.126, 50.344);
    assert.deepEqual(geometry(f.engine), {x: 10, y: 20, width: 99.13, height: 50.34});
    f.engine.setDisabled(true);
    f.engine.setSize(110, 90);
    assert.deepEqual(geometry(f.engine), {x: 10, y: 20, width: 110, height: 90});
});

test('draggable ignores setSize when resizing is disabled', function (t) {
    const f = createFixture(t);
    f.engine.setSize(200, 100);
    f.engine.setSize(NaN, undefined);
    assert.deepEqual(geometry(f.engine), {x: 0, y: 0, width: 0, height: 0});
    assert.equal(f.element.getBoundingClientRect().width, 100);
    assert.equal(f.events.length, 1);
});

test('draggable recaptures an initially empty box before resizing', function (t) {
    const f = createFixture(t, {resizable: true}, createHost({width: 0, height: 0}));
    f.applied.width = 100;
    f.applied.height = 80;
    f.handlePointer('pointerdown', 120, 110);
    assert.deepEqual(geometry(f.engine), {x: 0, y: 0, width: 100, height: 80});
    f.handlePointer('pointermove', 130, 130);
    assert.deepEqual(geometry(f.engine), {x: 0, y: 0, width: 110, height: 100});
});
