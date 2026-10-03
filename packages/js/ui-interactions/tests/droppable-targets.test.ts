import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture} from './helpers/droppable.ts';

for (const reverse of [false, true]) {
    test(`droppable selects the smallest containing target with reverse registration=${reverse}`, function (t) {
        const checks = [];
        const f = createFixture(t, {canDrop: (payload, target) => { checks.push({payload, target}); return true; }});
        const targets = [
            ['outer', {left: 0, top: 0, right: 100, bottom: 100}],
            ['inner', {left: 5, top: 5, right: 20, bottom: 20}],
            ['elsewhere', {left: 200, top: 200, right: 210, bottom: 210}],
        ];
        for (const [data, bounds] of reverse ? targets.reverse() : targets) f.createTarget(data, bounds);
        f.handlePointer('pointerdown');
        f.handlePointer('pointermove', 10, 10);
        assert.equal(f.engine.getState().activeTarget, 'inner');
        assert.deepEqual(checks, [{payload: f.payload, target: 'inner'}]);
        f.handlePointer('pointermove', 30, 30);
        assert.equal(f.engine.getState().activeTarget, 'outer');
        f.handlePointer('pointermove', 150, 150);
        assert.equal(f.engine.getState().activeTarget, null);
        assert.equal(f.engine.getState().canDropHere, false);
        assert.equal(checks.length, 2);
        f.handlePointer('pointerup');
        assert.equal(f.drops.length, 0);
    });
}

test('droppable includes target edges and excludes points immediately outside', function (t) {
    const f = createFixture(t);
    f.createTarget('zone');
    f.handlePointer('pointerdown');
    for (const [x, y] of [[5, 5], [50, 5], [50, 50], [5, 50]]) {
        f.handlePointer('pointermove', x, y);
        assert.equal(f.engine.getState().activeTarget, 'zone');
    }
    for (const [x, y] of [[4.9, 10], [50.1, 10], [10, 4.9], [10, 50.1]]) {
        f.handlePointer('pointermove', x, y);
        assert.equal(f.engine.getState().activeTarget, null);
    }
});

test('droppable remeasures target geometry on each move, even at unchanged coordinates', function (t) {
    const f = createFixture(t);
    const target = f.createTarget('zone');
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 10, 10);
    target.rect.left = 20;
    f.handlePointer('pointermove', 10, 10);
    assert.equal(f.engine.getState().activeTarget, null);
    target.rect.left = 5;
    f.handlePointer('pointermove', 10, 10);
    assert.equal(f.engine.getState().activeTarget, 'zone');
    assert.equal(f.events.length, 4);
});

test('droppable observes registration and unregistration on the next pointer move', function (t) {
    const f = createFixture(t);
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 10, 10);
    const target = f.createTarget('zone');
    assert.equal(f.events.length, 2);
    f.handlePointer('pointermove', 10, 10);
    assert.equal(f.engine.getState().activeTarget, 'zone');
    target.remove();
    target.remove();
    f.handlePointer('pointermove', 10, 10);
    assert.equal(f.engine.getState().activeTarget, null);
    assert.equal(f.events.length, 4);
    f.handlePointer('pointerup');
    assert.equal(f.drops.length, 0);
});

test('droppable falls back to a containing target after the smaller target is removed', function (t) {
    const f = createFixture(t);
    f.createTarget('outer', {left: 0, top: 0, right: 100, bottom: 100});
    const inner = f.createTarget('inner');
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 10, 10);
    inner.remove();
    f.handlePointer('pointermove', 10, 10);
    assert.equal(f.engine.getState().activeTarget, 'outer');
    f.handlePointer('pointerup');
    assert.equal(f.drops[0].target, 'outer');
});

test('droppable keeps a rejected inner target active and does not drop on its outer target', function (t) {
    const f = createFixture(t, {canDrop: (_payload, target) => target === 'outer'});
    f.createTarget('outer', {left: 0, top: 0, right: 100, bottom: 100});
    f.createTarget('inner');
    f.handlePointer('pointerdown');
    f.handlePointer('pointermove', 10, 10);
    assert.equal(f.engine.getState().activeTarget, 'inner');
    assert.equal(f.engine.getState().canDropHere, false);
    f.handlePointer('pointerup');
    assert.equal(f.drops.length, 0);
    assert.deepEqual(f.engine.getState(), f.events[0]);
});

for (const target of [0, false, '']) {
    test(`droppable accepts the non-null target ${JSON.stringify(target)}`, function (t) {
        const f = createFixture(t);
        f.createTarget(target);
        f.handlePointer('pointerdown');
        f.handlePointer('pointermove', 10, 10);
        f.handlePointer('pointerup');
        assert.equal(f.drops.length, 1);
        assert.equal(f.drops[0].target, target);
    });
}
