import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createDroppable} from 'strata-packages/ui-interactions/droppable';
import {createContainer, createFixture} from './helpers/droppable.ts';

test('droppable rejects missing and non-object configuration', function () {
    for (const config of [undefined, null, false, 1, 'options', () => {}]) {
        assert.throws(() => createDroppable(config), {name: 'TypeError', message: "createDroppable: 'config' must be an options object."});
    }
});

for (const name of ['onChange', 'onError', 'onDrop', 'getPayload', 'canDrop']) {
    test(`droppable rejects malformed ${name} before attaching listeners`, function () {
        for (const value of [null, false, 0, '', [], {}]) {
            const f = createContainer();
            assert.throws(() => createDroppable({container: f.container, [name]: value}), error => {
                assert.equal(error.name, 'TypeError');
                assert.ok(error.message.startsWith('createDroppable:'));
                assert.ok(error.message.includes(`'${name}'`));
                return true;
            });
            assert.equal(f.registrations.length, 0);
        }
    });
}

test('droppable requires the documented container capabilities', function () {
    for (const container of [undefined, null, {}, {ownerDocument: {}}, {getBoundingClientRect() {}}, {ownerDocument: {}, getBoundingClientRect: true}]) {
        assert.throws(() => createDroppable({container}), {name: 'TypeError', message: "createDroppable: the 'container' option must be a DOM element."});
    }
});

test('droppable rejects negative, non-finite and nonnumeric thresholds before setup', function () {
    for (const dragThreshold of [-1, NaN, Infinity, -Infinity, null, '4', false, {}]) {
        const f = createContainer();
        assert.throws(() => createDroppable({container: f.container, dragThreshold}), /'dragThreshold'.*non-negative number/);
        assert.equal(f.registrations.length, 0);
    }
});

test('droppable supports a duck-typed container and defaults to an inert payload resolver', function (t) {
    const f = createContainer();
    const engine = createDroppable({container: f.container});
    t.after(() => engine.destroy());
    const idle = {dragging: false, payload: null, point: null, origin: null, activeTarget: null, canDropHere: false};
    assert.deepEqual(engine.getState(), idle);
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 10, 10);
    f.handlePointer('pointerup');
    assert.deepEqual(engine.getState(), idle);
    assert.equal(f.captures.size, 0);
});

test('droppable accepts explicitly undefined optional callbacks', function (t) {
    const f = createFixture(t, {onChange: undefined, onError: undefined, onDrop: undefined, canDrop: undefined});
    f.createTarget('zone');
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 10, 10);
    assert.equal(f.engine.getState().canDropHere, true);
    f.handlePointer('pointerup');
    assert.equal(f.engine.getState().dragging, false);
});

test('droppable validates target capabilities without disturbing existing registrations', function (t) {
    const f = createFixture(t);
    f.createTarget('valid');
    for (const element of [undefined, null, {}, {getBoundingClientRect: 1}]) {
        assert.throws(() => f.engine.registerTarget(element, 'invalid'), {name: 'TypeError', message: "registerTarget: 'element' must be a DOM element."});
    }
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 10, 10);
    assert.equal(f.engine.getState().activeTarget, 'valid');
});

test('droppable rejects invalid subscribers without breaking subsequent delivery', function (t) {
    const f = createFixture(t);
    for (const listener of [undefined, null, {}, false, 1]) {
        assert.throws(() => f.engine.subscribe(listener), /listener.*function/);
    }
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 10, 10);
    assert.equal(f.events.length, 2);
});
