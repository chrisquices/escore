import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createSelection} from 'strata-packages/ui-interactions/selection';
import {createContainer, createFixture} from './helpers/selection.ts';

test('selection defaults to an empty multi-selection with no DOM requirement', function (t) {
    const engine = createSelection();
    t.after(() => engine.destroy());
    const initial = {selected: [], selectedCount: 0, anchor: null, focused: null, mode: 'multi', count: 0, marqueeing: false, marquee: null};
    assert.deepEqual(engine.getState(), initial);
    engine.select(0);
    engine.toggle(0);
    engine.selectRange(0, 0);
    engine.selectAll();
    engine.clear();
    assert.deepEqual(engine.getState(), initial);
});

test('selection emits one synchronous initial state with default numeric keys', function (t) {
    const states = [];
    const engine = createSelection({count: 3, onChange: state => states.push(state)});
    t.after(() => engine.destroy());
    assert.equal(states.length, 1);
    assert.deepEqual(states[0], engine.getState());
    engine.select(2);
    assert.deepEqual(states[1].selected, [2]);
});

test('selection rejects non-object options', function () {
    for (const config of [null, false, 0, 'config', () => {}]) {
        assert.throws(() => createSelection(config), {name: 'TypeError', message: "createSelection: 'config' must be an options object."});
    }
});

for (const name of ['onChange', 'onError', 'onEnter', 'onFocusRequest', 'getItemKey', 'calculateColumnCount']) {
    test(`selection rejects malformed ${name} before registering listeners`, function () {
        for (const value of [null, false, 1, 'callback', [], {}]) {
            const host = createContainer();
            assert.throws(() => createSelection({container: host.container, [name]: value}), error => {
                assert.equal(error.name, 'TypeError');
                assert.ok(error.message.includes(`'${name}'`));
                return true;
            });
            assert.equal(host.registrations.length, 0);
        }
    });
}

for (const [name, values] of [
    ['count', [-1, 1.5, NaN, Infinity, '3', null, false]],
    ['mode', ['multiple', '', null, 0, {}]],
    ['keyboard', [null, 0, 'true', {}]],
    ['marquee', [null, 0, 'true', {}]],
    ['collectIndicesInRect', [false, 1, 'callback', [], {}]],
    ['itemSelector', [false, 1, [], {}]],
    ['container', [false, 1, '', {}, {addEventListener: true}]],
]) {
    test(`selection validates ${name}`, function () {
        for (const value of values) {
            assert.throws(() => createSelection({[name]: value}), error => {
                assert.equal(error.name, 'TypeError');
                assert.ok(error.message.includes(`'${name}'`));
                return true;
            });
        }
    });
}

test('selection accepts undefined options and nullable DOM strategies', function (t) {
    const f = createFixture(t, {count: undefined, mode: undefined, keyboard: undefined, marquee: undefined, getItemKey: undefined, calculateColumnCount: undefined, itemSelector: null, collectIndicesInRect: null});
    assert.equal(f.engine.getState().count, 0);
    assert.equal(f.engine.getState().mode, 'multi');
    assert.equal(f.events.length, 1);
});

test('selection registers only on the supplied container and accepts its observed capabilities', function (t) {
    const host = createContainer();
    const f = createFixture(t, {keyboard: false, marquee: false}, host);
    assert.deepEqual(host.registrations.map(entry => entry.type), ['focusin', 'keydown', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']);
    assert.ok(host.registrations.every(entry => entry.options === undefined));
    f.key('ArrowRight');
    f.pointer('pointerdown');
    assert.equal(f.events.length, 1);
});

test('selection validates subscribers before and after destruction', function (t) {
    const f = createFixture(t);
    for (const destroyed of [false, true]) {
        if (destroyed) f.engine.destroy();
        for (const listener of [undefined, null, false, 1, {}, []]) assert.throws(() => f.engine.subscribe(listener), /listener.*function/);
    }
});
