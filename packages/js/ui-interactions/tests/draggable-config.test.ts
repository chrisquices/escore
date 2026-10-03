import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDraggable} from 'strata-packages/ui-interactions/draggable';
import {createHost, createFixture} from './helpers/draggable.ts';

test('draggable requires an element with event, geometry and document capabilities', function () {
    for (const element of [undefined, null, false, {}, {addEventListener() {}}, {addEventListener() {}, getBoundingClientRect() {}}]) {
        assert.throws(() => createDraggable(element), {name: 'TypeError', message: "createDraggable: 'element' must be a DOM element."});
    }
});

const invalidOptions = {
    onChange: [null, false, 0, '', [], {}],
    onError: [null, false, 0, '', [], {}],
    handle: [false, 1, {}, {addEventListener: true}],
    axis: [null, '', 'z', false, 1],
    bounds: [null, false, 'screen', {}, {top: 0, left: 0, right: 100}, {top: 0, left: 0, right: '100', bottom: 100}],
    threshold: [null, false, '5', -1, NaN, Infinity, -Infinity],
    disabled: [null, 0, 'false', {}],
    resizable: [null, 0, 'false', {}],
    resizeHandles: [null, false, 'n', {}, ['north'], ['n', 1]],
    minWidth: [null, false, '10', -1, NaN, Infinity],
    minHeight: [null, false, '10', -1, NaN, Infinity],
    maxWidth: [null, false, '10', -1, NaN, -Infinity],
    maxHeight: [null, false, '10', -1, NaN, -Infinity],
    aspectRatio: [false, 'square', 0, -1, NaN, Infinity],
    resizeEdgeSize: [null, false, '12', 0, -1, NaN, Infinity],
};

for (const [name, values] of Object.entries(invalidOptions)) {
    test(`draggable rejects malformed ${name} before setup`, function () {
        for (const value of values) {
            const host = createHost();
            assert.throws(() => createDraggable(host.element, {[name]: value}), error => {
                assert.equal(error.name, 'TypeError');
                assert.ok(error.message.startsWith('createDraggable:'));
                assert.ok(error.message.includes(`'${name}'`));
                return true;
            });
            assert.equal(host.element.registrations.length, 0);
            assert.equal(host.handle.registrations.length, 0);
        }
    });
}

test('draggable rejects minimum dimensions exceeding their maximum', function () {
    for (const options of [{minWidth: 21, maxWidth: 20}, {minHeight: 21, maxHeight: 20}]) {
        const host = createHost();
        assert.throws(() => createDraggable(host.element, options), /cannot exceed/);
        assert.equal(host.element.registrations.length, 0);
    }
});

test('draggable exposes all defaults and delivers the initial state synchronously', function (t) {
    const f = createFixture(t);
    assert.deepEqual(f.events, [{
        x: 0, y: 0, dragging: false, axis: 'both', disabled: false, canDrag: true,
        boundsMode: 'none', resizable: false, resizing: false, resizeSide: null,
        width: 0, height: 0, canResize: false, cursor: '', transform: 'translate(0px, 0px)',
    }]);
    assert.deepEqual(f.engine.getState(), f.events[0]);
    assert.equal(f.queries.length, 0);
});

test('draggable captures initial dimensions only when resizing is enabled', function (t) {
    const f = createFixture(t, {resizable: true, disabled: true}, createHost({width: 110.126, height: 75.344}));
    assert.equal(f.events.length, 1);
    assert.equal(f.events[0].width, 110.13);
    assert.equal(f.events[0].height, 75.34);
    assert.equal(f.events[0].canDrag, false);
    assert.equal(f.events[0].canResize, false);
    f.engine.setDisabled(false);
    assert.equal(f.engine.getState().canResize, true);
});

test('draggable accepts zero limits, no resize handles and undefined optional callbacks', function (t) {
    const host = createHost();
    const engine = createDraggable(host.element, {
        onChange: undefined, onError: undefined, threshold: 0, resizable: true,
        resizeHandles: [], minWidth: 0, minHeight: 0, maxWidth: 0, maxHeight: 0,
    });
    t.after(() => engine.destroy());
    engine.setSize(10, 20);
    assert.equal(engine.getState().width, 0);
    assert.equal(engine.getState().height, 0);
    host.element.handlePointer('pointerdown', 20, 30);
    assert.equal(engine.getState().resizing, false);
});

test('draggable accepts unlimited maximum dimensions and positive aspect ratios', function (t) {
    for (const aspectRatio of [null, 'auto', 0.5, 2]) {
        const f = createFixture(t, {resizable: true, aspectRatio, maxWidth: Infinity, maxHeight: Infinity});
        f.engine.setSize(10000, 20000);
        assert.equal(f.engine.getState().width, 10000);
        assert.equal(f.engine.getState().height, 20000);
    }
});

test('draggable validates public setters without changing state', function (t) {
    const f = createFixture(t, {resizable: true});
    const initial = f.engine.getState();
    for (const value of [undefined, null, false, '1', NaN, Infinity, -Infinity, {}]) {
        assert.throws(() => f.engine.setPosition(value, 1), /setPosition.*finite numbers/);
        assert.throws(() => f.engine.setPosition(1, value), /setPosition.*finite numbers/);
        assert.throws(() => f.engine.setSize(value, 1), /setSize.*finite numbers/);
        assert.throws(() => f.engine.setSize(1, value), /setSize.*finite numbers/);
    }
    for (const value of [undefined, null, 0, 1, 'false', NaN, Infinity, {}]) {
        assert.throws(() => f.engine.setDisabled(value), /setDisabled.*boolean/);
    }
    assert.deepEqual(f.engine.getState(), initial);
    assert.equal(f.events.length, 1);
});

test('draggable validates subscribers before registering them', function (t) {
    const f = createFixture(t);
    for (const listener of [undefined, null, false, 1, {}, 'listener']) {
        assert.throws(() => f.engine.subscribe(listener), /listener.*function/);
    }
    f.engine.setPosition(1, 2);
    assert.equal(f.events.length, 2);
});
