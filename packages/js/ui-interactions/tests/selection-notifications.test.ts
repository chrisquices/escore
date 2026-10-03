import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture} from './helpers/selection.ts';

test('selection subscription and state reads are silent until a synchronous change', function (t) {
    const f = createFixture(t);
    const received = [];
    f.engine.subscribe(state => received.push(state));
    assert.deepEqual(f.engine.getState(), f.events[0]);
    assert.equal(received.length, 0);
    f.engine.select(2);
    assert.equal(received.length, 1);
    assert.deepEqual(received[0], f.engine.getState());
    const later = [];
    f.engine.subscribe(state => later.push(state));
    f.engine.select(2);
    assert.equal(later.length, 0);
    f.engine.setFocused(4);
    assert.equal(received.length, 2);
    assert.equal(later.length, 1);
});

test('selection no-op API calls, idle events, repeated focus and identical membership stay silent', function (t) {
    const f = createFixture(t);
    f.engine.clear();
    f.engine.setFocused(null);
    f.engine.deselect(2);
    for (const type of ['pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) f.pointer(type);
    assert.equal(f.events.length, 1);
    f.engine.select(2);
    f.engine.select(2);
    f.engine.selectRange(2, 2);
    f.engine.setFocused(2);
    f.engine.deselect(3);
    assert.equal(f.events.length, 2);
    f.engine.selectAll();
    f.engine.selectAll();
    assert.equal(f.events.length, 3);
    f.engine.clear();
    f.engine.clear();
    assert.equal(f.events.length, 4);
});

test('selection changes to anchor or focus notify even when membership stays the same', function (t) {
    const f = createFixture(t, {getItemKey: () => 'shared'});
    f.engine.select(0);
    f.engine.select(1);
    f.engine.setFocused(4);
    assert.equal(f.events.length, 4);
    assert.deepEqual(f.events.slice(1).map(state => state.selected), [['shared'], ['shared'], ['shared']]);
    assert.deepEqual(f.events.slice(1).map(state => [state.anchor, state.focused]), [[0, 0], [1, 1], [1, 4]]);
});

test('selection unchanged marquee moves still resolve providers but do not notify', function (t) {
    let calls = 0;
    let hits = [2];
    const f = createFixture(t, {collectIndicesInRect() { calls++; return hits; }});
    f.pointer('pointerdown');
    f.pointer('pointermove', 120, 130);
    f.pointer('pointermove', 120, 130);
    assert.equal(calls, 2);
    assert.equal(f.events.length, 3);
    hits = [3];
    f.pointer('pointermove', 120, 130);
    assert.equal(f.events.length, 4);
    f.pointer('pointermove', 121, 130);
    assert.equal(f.events.length, 5);
    f.pointer('pointerup');
    f.pointer('pointerup');
    assert.equal(f.events.length, 6);
});

test('selection notifications never serialize state or opaque keys', function (t) {
    const stringify = t.mock.method(JSON, 'stringify', () => assert.fail('state must not be serialized'));
    const circular = {toJSON() { assert.fail('keys must not be serialized'); }, toString: () => 'circular'};
    circular.self = circular;
    const keys = [1n, circular, Symbol('key')];
    const f = createFixture(t, {count: keys.length, getItemKey: index => keys[index], collectIndicesInRect: () => [0, 1, 2]});
    f.engine.selectAll();
    f.engine.setFocused(2);
    f.engine.deselect(0);
    f.engine.selectRange(0, 2);
    f.pointer('pointerdown');
    f.pointer('pointermove', 120, 130);
    f.pointer('pointercancel');
    f.engine.clear();
    assert.equal(stringify.mock.callCount(), 0);
    stringify.mock.restore();
    assert.equal(f.errors.length, 0);
    assert.equal(f.engine.getState().selectedCount, 0);
});

test('selection compares key identity without sorting or serializing no-op updates', function (t) {
    let coercions = 0;
    const keys = Array.from({length: 6}, (_, index) => ({toString() { coercions++; return String(index); }}));
    const f = createFixture(t, {getItemKey: index => keys[index]});
    f.engine.selectAll();
    f.engine.setFocused(2);
    const count = f.events.length;
    assert.ok(coercions > 0);
    coercions = 0;
    const stringify = t.mock.method(JSON, 'stringify', () => assert.fail('no-op updates must not serialize a snapshot'));
    f.engine.selectAll();
    f.engine.setFocused(2);
    f.engine.deselect(-1);
    assert.equal(coercions, 0);
    assert.equal(stringify.mock.callCount(), 0);
    stringify.mock.restore();
    assert.equal(f.events.length, count);
});

test('selection distinguishes equal-looking opaque keys while preserving their references', function (t) {
    const first = {toString: () => 'same'};
    const second = {toString: () => 'same'};
    let key = first;
    const f = createFixture(t, {count: 1, getItemKey: () => key});
    f.engine.select(0);
    assert.equal(f.events[1].selected[0], first);
    key = second;
    f.engine.select(0);
    assert.equal(f.events.length, 3);
    assert.equal(f.events[2].selected[0], second);
    assert.equal(f.engine.isSelected(first), false);
    assert.equal(f.engine.isSelected(second), true);
});

test('selection every consumer and getState receive fresh arrays and rectangles with shared opaque keys', function (t) {
    const key = {toString: () => 'key'};
    const f = createFixture(t, {getItemKey: () => key, collectIndicesInRect: () => [1], onChange(state) {
        state.selected.length = 0;
        state.focused = 999;
        if (state.marquee) state.marquee.width = 999;
    }});
    const received = [];
    f.engine.subscribe(state => { state.selected.push('corrupt'); state.selectedCount = 999; if (state.marquee) state.marquee.x = 999; });
    f.engine.subscribe(state => received.push(state));
    f.pointer('pointerdown');
    f.pointer('pointermove', 120, 130);
    const first = f.engine.getState();
    const second = f.engine.getState();
    assert.deepEqual(received.at(-1), first);
    assert.equal(first.selected[0], key);
    assert.equal(first.selectedCount, 1);
    assert.equal(first.focused, null);
    assert.deepEqual(first.marquee, {x: 80, y: 70, width: 20, height: 30});
    assert.notEqual(first, second);
    assert.notEqual(first.selected, second.selected);
    assert.notEqual(first.marquee, second.marquee);
    assert.notEqual(first.selected, received.at(-1).selected);
    assert.notEqual(first.marquee, received.at(-1).marquee);
    first.selected.length = 0;
    first.marquee.height = 999;
    assert.deepEqual(f.engine.getState(), second);
});

test('selection isolates throwing initial and later consumers and continues delivery', function (t) {
    const logged = t.mock.method(console, 'error', () => {});
    const cause = new Error('listener failed');
    const f = createFixture(t, {onChange() { throw cause; }});
    assert.equal(logged.mock.callCount(), 1);
    const received = [];
    const detach = f.engine.subscribe(() => { throw cause; });
    f.engine.subscribe(state => received.push(state));
    f.engine.select(2);
    assert.equal(logged.mock.callCount(), 3);
    assert.equal(received.length, 1);
    assert.deepEqual(received[0], f.engine.getState());
    assert.equal(f.errors.length, 0);
    detach();
    f.engine.select(3);
    assert.equal(logged.mock.callCount(), 4);
    assert.equal(received.length, 2);
});

test('selection duplicate subscribers deliver once and either unsubscribe handle removes them', function (t) {
    const f = createFixture(t);
    const received = [];
    const listener = state => received.push(state);
    const first = f.engine.subscribe(listener);
    const second = f.engine.subscribe(listener);
    f.engine.select(1);
    assert.equal(received.length, 1);
    second();
    f.engine.select(2);
    assert.equal(received.length, 1);
    f.engine.subscribe(listener);
    f.engine.select(3);
    assert.equal(received.length, 2);
    first();
    first();
    f.engine.select(4);
    assert.equal(received.length, 2);
});

test('selection honors unsubscription during delivery and later resubscription', function (t) {
    const f = createFixture(t);
    const received = [];
    let detach;
    const first = f.engine.subscribe(() => detach());
    const listener = state => received.push(state);
    detach = f.engine.subscribe(listener);
    f.engine.select(1);
    assert.equal(received.length, 0);
    first();
    f.engine.subscribe(listener);
    f.engine.select(2);
    assert.equal(received.length, 1);
});

test('selection reentrant changes supersede stale delivery to later subscribers', function (t) {
    const f = createFixture(t);
    const received = [];
    f.engine.subscribe(state => { if (state.focused === 1) f.engine.select(4); });
    f.engine.subscribe(state => received.push(state));
    f.engine.select(1);
    assert.equal(received.length, 1);
    assert.deepEqual(received[0], f.engine.getState());
    assert.deepEqual(received[0].selected, [4]);
});

test('selection reentrant changes back to the prior state still reach later subscribers', function (t) {
    const f = createFixture(t);
    f.engine.select(3);
    f.engine.deselect(3);
    const before = f.engine.getState();
    const received = [];
    f.engine.subscribe(state => { if (state.selectedCount) f.engine.deselect(3); });
    f.engine.subscribe(state => received.push(state));
    f.engine.select(3);
    assert.deepEqual(received, [before]);
    assert.deepEqual(f.events.slice(-2).map(state => state.selected), [[3], []]);
});

test('selection reentrant no-op APIs do not recurse or starve later subscribers', function (t) {
    const f = createFixture(t);
    const received = [];
    f.engine.subscribe(state => {
        f.engine.select(state.focused);
        f.engine.setFocused(state.focused);
        f.engine.deselect(5);
    });
    f.engine.subscribe(state => received.push(state));
    f.engine.select(2);
    assert.equal(received.length, 1);
    assert.deepEqual(received[0], f.engine.getState());
    assert.equal(f.events.length, 2);
});

test('selection reentrant cancellation supersedes active-marquee delivery', function (t) {
    const f = createFixture(t);
    const received = [];
    f.engine.select(2);
    f.engine.subscribe(state => { if (state.marqueeing) f.pointer('pointercancel'); });
    f.engine.subscribe(state => received.push(state));
    f.pointer('pointerdown');
    assert.equal(received.length, 1);
    assert.deepEqual(received[0], f.engine.getState());
    assert.equal(received[0].marqueeing, false);
    assert.deepEqual(received[0].selected, [2]);
    assert.equal(f.captures.size, 0);
});
