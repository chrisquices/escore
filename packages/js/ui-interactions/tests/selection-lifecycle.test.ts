import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture, selection} from './helpers/selection.ts';

test('selection destroy removes each exact listener once and releases capture after resetting the gesture', function (t) {
    const f = createFixture(t, {collectIndicesInRect: () => [2, 3]});
    f.engine.select(5);
    f.pointer('pointerdown');
    f.pointer('pointermove', 120, 130);
    f.engine.setFocused(1);
    const duringRelease = [];
    f.container.releasePointerCapture = id => {
        duringRelease.push(f.engine.getState());
        f.releaseCalls.push(id);
        f.captures.delete(id);
        f.pointer('lostpointercapture', 100, 100, {pointerId: id});
    };
    const count = f.events.length;
    f.engine.destroy();
    f.engine.destroy();
    assert.deepEqual(f.removals, f.registrations);
    assert.equal(f.handlers.size, 0);
    assert.deepEqual(f.releaseCalls, [1]);
    assert.equal(f.captures.size, 0);
    assert.equal(f.events.length, count);
    assert.equal(duringRelease[0].marqueeing, false);
    assert.equal(duringRelease[0].marquee, null);
    assert.deepEqual(selection(f.engine), {selected: [5], anchor: 5, focused: 1});
});

test('selection idle destruction preserves readable state and makes APIs and saved late handlers inert', function (t) {
    let keyCalls = 0;
    let rectCalls = 0;
    const enters = [];
    const requests = [];
    const f = createFixture(t, {
        itemSelector: '.item',
        getItemKey(index) { keyCalls++; return index; },
        collectIndicesInRect() { rectCalls++; return [1]; },
        onEnter: context => enters.push(context), onFocusRequest: context => requests.push(context),
    });
    f.engine.select(3);
    const before = f.engine.getState();
    const late = [...f.registrations];
    f.engine.destroy();
    const received = [];
    const detach = f.engine.subscribe(state => received.push(state));
    const keyCount = keyCalls;
    f.engine.select(1);
    f.engine.toggle(2);
    f.engine.deselect(3);
    f.engine.selectRange(0, 5);
    f.engine.selectAll();
    f.engine.clear();
    f.engine.setFocused(0);
    f.engine.setFocused(null);
    for (const {type, handler} of late) {
        const event = {type, target: f.items[0], pointerId: 1, button: 0, clientX: 120, clientY: 130, key: 'ArrowRight', preventDefault() { assert.fail('late events must stay inert'); }};
        handler(event);
        if (type === 'keydown') { handler({...event, key: 'Enter'}); handler({...event, key: 'Escape'}); }
    }
    detach();
    detach();
    assert.deepEqual(f.engine.getState(), before);
    assert.equal(f.engine.isSelected(3), true);
    assert.equal(keyCalls, keyCount);
    assert.equal(rectCalls, 0);
    assert.equal(received.length, 0);
    assert.equal(enters.length, 0);
    assert.equal(requests.length, 0);
    assert.equal(f.events.length, 2);
    assert.equal(f.errors.length, 0);
});

test('selection destruction during delivery stops later subscribers and keyboard focus callbacks', function (t) {
    const requests = [];
    const f = createFixture(t, {onFocusRequest: context => requests.push(context)});
    const later = [];
    f.engine.subscribe(() => f.engine.destroy());
    f.engine.subscribe(state => later.push(state));
    f.key('ArrowRight');
    assert.deepEqual(f.engine.getState().selected, [0]);
    assert.equal(later.length, 0);
    assert.equal(requests.length, 0);
    assert.equal(f.handlers.size, 0);
});

test('selection destruction in onChange settles active capture before later consumers', function (t) {
    const f = createFixture(t, {onChange(state) { if (state.marqueeing) f.engine.destroy(); }});
    const later = [];
    f.engine.subscribe(state => later.push(state));
    f.pointer('pointerdown');
    assert.equal(later.length, 0);
    assert.equal(f.engine.getState().marqueeing, false);
    assert.equal(f.captures.size, 0);
    assert.deepEqual(f.releaseCalls, [1]);
    assert.equal(f.handlers.size, 0);
});

test('selection destruction inside key resolution prevents partial updates and further provider calls', function (t) {
    const resolved = [];
    let destroy = false;
    const f = createFixture(t, {getItemKey(index) {
        resolved.push(index);
        if (destroy && index === 1) f.engine.destroy();
        return index;
    }});
    f.engine.select(5);
    const before = f.engine.getState();
    destroy = true;
    f.engine.selectRange(0, 4);
    assert.deepEqual(resolved, [5, 0, 1]);
    assert.deepEqual(f.engine.getState(), before);
    assert.equal(f.events.length, 2);
    assert.equal(f.errors.length, 0);
});

test('selection destruction inside marquee hit testing prevents key resolution and releases capture', function (t) {
    const resolved = [];
    const f = createFixture(t, {getItemKey: index => { resolved.push(index); return index; }, collectIndicesInRect() { f.engine.destroy(); return [1, 2]; }});
    f.engine.select(5);
    f.pointer('pointerdown');
    f.pointer('pointermove', 120, 130);
    assert.deepEqual(resolved, [5]);
    assert.deepEqual(selection(f.engine), {selected: [5], anchor: 5, focused: 5});
    assert.equal(f.engine.getState().marqueeing, false);
    assert.equal(f.captures.size, 0);
    assert.equal(f.events.length, 3);
});

test('selection destruction in a column provider prevents follow-up focus callbacks', function (t) {
    const requests = [];
    const f = createFixture(t, {calculateColumnCount() { f.engine.destroy(); return 1; }, onFocusRequest: context => requests.push(context)});
    f.key('ArrowRight');
    assert.equal(f.events.length, 1);
    assert.equal(requests.length, 0);
    assert.equal(f.engine.getState().focused, null);
});

test('selection destruction from onError stops later callbacks and makes recovery calls inert', function (t) {
    let reports = 0;
    const requests = [];
    const f = createFixture(t, {calculateColumnCount() { throw new Error('columns failed'); }, onError() {
        reports++;
        f.engine.destroy();
        f.engine.select(3);
    }, onFocusRequest: context => requests.push(context)});
    f.key('ArrowRight');
    f.key('ArrowRight');
    assert.equal(reports, 1);
    assert.equal(f.events.length, 1);
    assert.equal(requests.length, 0);
    assert.deepEqual(f.engine.getState().selected, []);
});

test('selection destruction during marquee-error rollback suppresses the subsequent error callback', function (t) {
    let destroy = false;
    const f = createFixture(t, {collectIndicesInRect() { throw new Error('hit test failed'); }, onChange(state) {
        if (destroy && !state.marqueeing) f.engine.destroy();
    }});
    f.engine.select(5);
    f.pointer('pointerdown');
    destroy = true;
    f.pointer('pointermove', 120, 130);
    assert.equal(f.errors.length, 0);
    assert.equal(f.captures.size, 0);
    assert.equal(f.handlers.size, 0);
    assert.deepEqual(f.engine.getState().selected, [5]);
});

test('selection destruction swallows capture cleanup errors and continues detaching listeners', function (t) {
    const f = createFixture(t);
    f.pointer('pointerdown');
    f.container.releasePointerCapture = () => { throw new Error('capture cleanup failed'); };
    const count = f.events.length;
    assert.doesNotThrow(() => f.engine.destroy());
    assert.deepEqual(f.removals, f.registrations);
    assert.equal(f.handlers.size, 0);
    assert.equal(f.errors.length, 0);
    assert.equal(f.events.length, count);
    assert.equal(f.engine.getState().marqueeing, false);
});

test('selection reset skips release when capture is already lost', function (t) {
    const f = createFixture(t);
    f.pointer('pointerdown');
    f.captures.clear();
    f.pointer('lostpointercapture');
    assert.deepEqual(f.releaseCalls, []);
    assert.equal(f.engine.getState().marqueeing, false);
    assert.equal(f.events.length, 3);
});

test('selection independent engines retain their own state, subscriptions, capture, and listeners', function (t) {
    const first = createFixture(t, {collectIndicesInRect: () => [1]});
    const second = createFixture(t, {collectIndicesInRect: () => [4]});
    first.engine.select(2);
    second.engine.select(5);
    first.pointer('pointerdown');
    second.pointer('pointerdown');
    first.pointer('pointermove', 120, 130);
    second.pointer('pointermove', 120, 130);
    first.engine.destroy();
    assert.deepEqual(first.engine.getState().selected, [2]);
    assert.deepEqual(second.engine.getState().selected, [4]);
    assert.equal(first.captures.size, 0);
    assert.equal(second.captures.size, 1);
    assert.equal(second.handlers.size, 7);
    second.pointer('pointerup');
    second.engine.select(3);
    assert.deepEqual(second.engine.getState().selected, [3]);
    assert.deepEqual(first.engine.getState().selected, [2]);
});
