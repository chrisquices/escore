import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createContainer, createFixture, selection} from './helpers/selection.ts';

test('selection marquee begins synchronously, uses the four-pixel axis threshold, and continues below it after crossing', function (t) {
    const rectangles = [];
    const f = createFixture(t, {collectIndicesInRect: rect => { rectangles.push(rect); return [2]; }});
    f.engine.select(5);
    f.pointer('pointerdown', 100, 100);
    assert.equal(f.engine.getState().marqueeing, true);
    assert.equal(f.engine.getState().marquee, null);
    assert.deepEqual(f.captureCalls, [1]);
    assert.equal(f.events.length, 3);
    f.pointer('pointermove', 103.9, 103.9);
    assert.equal(rectangles.length, 0);
    assert.equal(f.events.length, 3);
    f.pointer('pointermove', 104, 100);
    assert.deepEqual(rectangles[0], {x: 80, y: 70, width: 4, height: 0});
    assert.deepEqual(selection(f.engine), {selected: [2], anchor: 5, focused: 5});
    f.pointer('pointermove', 101, 99);
    assert.deepEqual(rectangles[1], {x: 80, y: 69, width: 1, height: 1});
    f.pointer('pointerup');
    assert.equal(f.engine.getState().marqueeing, false);
    assert.equal(f.engine.getState().marquee, null);
    assert.deepEqual(f.engine.getState().selected, [2]);
    assert.deepEqual(f.releaseCalls, [1]);
});

test('selection marquee uses content coordinates including current scroll and borders', function (t) {
    const host = createContainer({clientLeft: 2, clientTop: 3, scrollLeft: 40, scrollTop: 50});
    const rectangles = [];
    const f = createFixture(t, {collectIndicesInRect: rect => { rectangles.push(rect); return []; }}, host);
    f.pointer('pointerdown', 32, 43);
    host.container.scrollLeft = 45;
    host.container.scrollTop = 55;
    f.pointer('pointermove', 52, 63);
    assert.deepEqual(rectangles[0], {x: 50, y: 60, width: 25, height: 25});
    f.pointer('pointermove', 12, 23);
    assert.deepEqual(rectangles[1], {x: 35, y: 45, width: 15, height: 15});
});

test('selection DOM hit testing uses strict rectangle intersections in content coordinates', function (t) {
    const host = createContainer({clientLeft: 2, clientTop: 3, scrollLeft: 40, scrollTop: 50});
    const f = createFixture(t, {itemSelector: '.item'}, host);
    // Content (-1,-1) to (25,25): cells beginning at 25 only touch the edges.
    f.pointer('pointerdown', -19, -18);
    f.pointer('pointermove', 7, 8);
    assert.deepEqual(f.engine.getState().marquee, {x: -1, y: -1, width: 26, height: 26});
    assert.deepEqual(f.engine.getState().selected, [0]);
    f.pointer('pointermove', 8, 9);
    assert.deepEqual(f.engine.getState().selected, [0, 1, 3, 4]);
    host.items[0].box.x = 100;
    f.pointer('pointermove', 8, 9);
    assert.deepEqual(f.engine.getState().selected, [1, 3, 4]);
});

test('selection custom hit testing takes precedence and receives an independent rectangle', function (t) {
    const f = createFixture(t, {itemSelector: '.item', collectIndicesInRect(rect) { rect.x = 999; rect.width = 999; return [4, 4, 1]; }});
    f.pointer('pointerdown', 100, 100);
    f.pointer('pointermove', 120, 130);
    assert.deepEqual(f.engine.getState().marquee, {x: 80, y: 70, width: 20, height: 30});
    assert.deepEqual(f.engine.getState().selected, [1, 4]);
    assert.equal(f.engine.getState().selectedCount, 2);
});

for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey']) {
    test(`selection additive marquee uses the original snapshot with ${modifier}`, function (t) {
        let hits = [2, 3];
        const f = createFixture(t, {collectIndicesInRect: () => hits});
        f.engine.select(0);
        f.pointer('pointerdown', 100, 100, {[modifier]: true});
        f.pointer('pointermove', 120, 130);
        assert.deepEqual(f.engine.getState().selected, [0, 2, 3]);
        hits = [4];
        f.pointer('pointermove', 120, 130);
        assert.deepEqual(selection(f.engine), {selected: [0, 4], anchor: 0, focused: 0});
        f.engine.select(1);
        f.pointer('pointermove', 125, 135);
        assert.deepEqual(selection(f.engine), {selected: [0, 4], anchor: 1, focused: 1});
        f.pointer('pointercancel');
        assert.deepEqual(selection(f.engine), {selected: [0], anchor: 0, focused: 1});
    });
}

test('selection non-additive marquee replaces prior membership and preserves focus and anchor', function (t) {
    const f = createFixture(t, {collectIndicesInRect: () => []});
    f.engine.select(3);
    f.pointer('pointerdown');
    assert.deepEqual(selection(f.engine), {selected: [3], anchor: 3, focused: 3});
    f.pointer('pointermove', 120, 120);
    assert.deepEqual(selection(f.engine), {selected: [], anchor: 3, focused: 3});
    f.pointer('pointerup');
    assert.deepEqual(selection(f.engine), {selected: [], anchor: 3, focused: 3});
});

test('selection unmodified empty clicks clear selection and anchor while modified clicks preserve them', function (t) {
    const f = createFixture(t);
    for (const modifier of ['metaKey', 'ctrlKey', 'shiftKey']) {
        f.engine.select(3);
        f.pointer('pointerdown', 100, 100, {[modifier]: true});
        f.pointer('pointermove', 102, 102);
        f.pointer('pointerup');
        assert.deepEqual(selection(f.engine), {selected: [3], anchor: 3, focused: 3});
    }
    f.pointer('pointerdown');
    f.pointer('pointerup');
    assert.deepEqual(selection(f.engine), {selected: [], anchor: null, focused: 3});
});

test('selection marquee without a hit-test strategy still exposes rectangles and selects no items', function (t) {
    const f = createFixture(t);
    f.engine.select(2);
    f.pointer('pointerdown');
    f.pointer('pointermove', 110, 120);
    assert.deepEqual(f.engine.getState().marquee, {x: 80, y: 70, width: 10, height: 20});
    assert.deepEqual(f.engine.getState().selected, []);
});

test('selection marquee keeps pointer ownership and ignores a second press until the first ends', function (t) {
    const f = createFixture(t, {collectIndicesInRect: () => [2]});
    f.pointer('pointerdown', 100, 100, {pointerId: 7});
    f.pointer('pointerdown', 50, 50, {pointerId: 8});
    for (const type of ['pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) f.pointer(type, 130, 130, {pointerId: 8});
    assert.deepEqual(f.captureCalls, [7]);
    assert.equal(f.events.length, 2);
    assert.equal(f.engine.getState().marqueeing, true);
    f.pointer('pointermove', 120, 120, {pointerId: 7});
    f.pointer('pointerup', 120, 120, {pointerId: 7});
    assert.deepEqual(f.engine.getState().selected, [2]);
    assert.deepEqual(f.releaseCalls, [7]);
    f.pointer('pointerdown', 50, 50, {pointerId: 8});
    assert.deepEqual(f.captureCalls, [7, 8]);
});

for (const config of [{marquee: false}, {mode: 'single'}]) {
    test(`selection marquee remains disabled for ${Object.keys(config)[0]} configuration`, function (t) {
        const f = createFixture(t, config);
        f.pointer('pointerdown');
        f.pointer('pointermove', 150, 150);
        f.pointer('pointerup');
        assert.equal(f.events.length, 1);
        assert.deepEqual(f.captureCalls, []);
    });
}

test('selection marquee ignores non-primary buttons, handled events, item roots and nested controls', function (t) {
    const f = createFixture(t, {itemSelector: '.item'});
    const button = f.createElement({tag: 'button'}, f.container);
    const editable = f.createElement({attributes: {contenteditable: 'true'}}, f.container);
    const child = f.createElement({}, f.items[0]);
    for (const values of [{button: 1}, {button: 2}, {defaultPrevented: true}, {target: f.items[0]}, {target: child}, {target: button}, {target: editable}, {target: null}, {target: {}}]) {
        f.pointer('pointerdown', 100, 100, values);
    }
    assert.equal(f.events.length, 1);
    assert.deepEqual(f.captureCalls, []);
    const blank = f.createElement({}, f.container);
    f.pointer('pointerdown', 100, 100, {target: blank});
    assert.equal(f.engine.getState().marqueeing, true);
});

test('selection without itemSelector only starts marquee directly on the container', function (t) {
    const f = createFixture(t);
    const blank = f.createElement({}, f.container);
    f.pointer('pointerdown', 100, 100, {target: blank});
    assert.equal(f.engine.getState().marqueeing, false);
    f.pointer('pointerdown');
    assert.equal(f.engine.getState().marqueeing, true);
});

for (const cancel of ['pointercancel', 'lostpointercapture', 'Escape']) {
    test(`selection ${cancel} restores the original selection and anchor but preserves later focus`, function (t) {
        const f = createFixture(t, {collectIndicesInRect: () => [2, 3], itemSelector: '.item'});
        f.engine.select(5);
        f.pointer('pointerdown');
        f.pointer('pointermove', 120, 130);
        f.dispatch('focusin', {target: f.items[1]});
        if (cancel === 'Escape') assert.equal(f.key('Escape').defaultPrevented, true);
        else f.pointer(cancel);
        assert.deepEqual(selection(f.engine), {selected: [5], anchor: 5, focused: 1});
        assert.equal(f.engine.getState().marqueeing, false);
        assert.equal(f.engine.getState().marquee, null);
        assert.equal(f.captures.size, 0);
        const count = f.events.length;
        f.pointer('pointercancel');
        f.pointer('lostpointercapture');
        f.pointer('pointerup');
        assert.equal(f.events.length, count);
    });
}

test('selection ignores descendant capture loss and handles synchronous capture loss during release once', function (t) {
    const f = createFixture(t, {collectIndicesInRect: () => [2]});
    f.container.releasePointerCapture = id => {
        f.releaseCalls.push(id);
        f.captures.delete(id);
        f.pointer('lostpointercapture', 100, 100, {pointerId: id});
    };
    f.pointer('pointerdown');
    f.pointer('pointermove', 120, 120);
    f.pointer('lostpointercapture', 100, 100, {target: f.items[0]});
    assert.equal(f.engine.getState().marqueeing, true);
    f.pointer('pointerup');
    assert.equal(f.events.length, 4);
    assert.deepEqual(f.releaseCalls, [1]);
    assert.deepEqual(f.engine.getState().selected, [2]);
});

test('selection marquee provider failures cancel atomically and allow a later gesture', function (t) {
    const cause = new Error('hit testing failed');
    let fail = false;
    const f = createFixture(t, {collectIndicesInRect() { if (fail) throw cause; return [2, 3]; }});
    f.engine.select(5);
    f.pointer('pointerdown');
    f.pointer('pointermove', 120, 120);
    f.engine.setFocused(4);
    fail = true;
    f.pointer('pointermove', 130, 130);
    assert.deepEqual(selection(f.engine), {selected: [5], anchor: 5, focused: 4});
    assert.equal(f.engine.getState().marqueeing, false);
    assert.equal(f.engine.getState().marquee, null);
    assert.equal(f.captures.size, 0);
    assert.deepEqual(f.errors[0].metadata, {operation: 'marquee', cause});
    assert.deepEqual(f.events.at(-1), f.engine.getState());
    fail = false;
    f.pointer('pointerdown');
    f.pointer('pointermove', 120, 120);
    assert.deepEqual(f.engine.getState().selected, [2, 3]);
});

test('selection marquee key failures never publish partial hits', function (t) {
    const cause = new Error('key failed');
    const f = createFixture(t, {getItemKey(index) { if (index === 3) throw cause; return index; }, collectIndicesInRect: () => [2, 3]});
    f.engine.select(5);
    f.pointer('pointerdown');
    f.pointer('pointermove', 120, 120);
    assert.deepEqual(selection(f.engine), {selected: [5], anchor: 5, focused: 5});
    assert.ok(f.events.every(state => !state.selected.includes(2)));
    assert.equal(f.errors[0].metadata.cause, cause);
    assert.equal(f.engine.getState().marqueeing, false);
});

test('selection start geometry and capture failures roll back without duplicate idle delivery', function (t) {
    for (const capability of ['getBoundingClientRect', 'setPointerCapture']) {
        const f = createFixture(t);
        const cause = new Error(`${capability} failed`);
        f.engine.select(2);
        const before = f.engine.getState();
        f.container[capability] = () => { throw cause; };
        f.pointer('pointerdown');
        assert.deepEqual(f.engine.getState(), before);
        assert.equal(f.events.length, 2);
        assert.equal(f.errors.length, 1);
        assert.deepEqual(f.errors[0].metadata, {operation: 'marquee', cause});
    }
});

test('selection capture-release failures restore the original selection and report the failure once', function (t) {
    const cause = new Error('release failed');
    const f = createFixture(t, {collectIndicesInRect: () => [2]});
    f.engine.select(5);
    f.pointer('pointerdown');
    f.pointer('pointermove', 120, 120);
    f.engine.setFocused(3);
    f.container.releasePointerCapture = () => { throw cause; };
    f.pointer('pointerup');
    assert.deepEqual(selection(f.engine), {selected: [5], anchor: 5, focused: 3});
    assert.equal(f.engine.getState().marqueeing, false);
    assert.deepEqual(f.errors[0].metadata, {operation: 'pointer-capture', cause});
    assert.deepEqual(f.events.at(-1), f.engine.getState());
    assert.equal(f.events.filter(state => !state.marqueeing && state.focused === 3).length, 1);
});

test('selection failed capture publishes rollback after a reentrant no-op exposes the gesture', function (t) {
    const f = createFixture(t);
    f.engine.select(2);
    f.container.setPointerCapture = () => {
        f.engine.select(2);
        throw new Error('capture failed');
    };
    f.pointer('pointerdown');
    assert.deepEqual(f.events.map(state => state.marqueeing), [false, false, true, false]);
    assert.deepEqual(f.events.at(-1), f.engine.getState());
    assert.deepEqual(selection(f.engine), {selected: [2], anchor: 2, focused: 2});
    assert.equal(f.errors.length, 1);
});

test('selection unpublished capture rollback stays silent during reentrant no-op release', function (t) {
    const f = createFixture(t);
    f.engine.select(2);
    f.container.setPointerCapture = id => {
        f.captures.add(id);
        throw new Error('capture failed');
    };
    f.container.releasePointerCapture = id => {
        f.captures.delete(id);
        f.engine.select(2);
    };
    f.pointer('pointerdown');
    assert.equal(f.events.length, 2);
    assert.equal(f.engine.getState().marqueeing, false);
    assert.equal(f.captures.size, 0);
    assert.equal(f.errors.length, 1);
});

test('selection a failing capture callback cannot cancel its replacement gesture', function (t) {
    const f = createFixture(t, {collectIndicesInRect: () => [1]});
    f.engine.select(5);
    f.container.setPointerCapture = id => {
        f.captures.add(id);
        if (id === 1) {
            f.pointer('pointercancel');
            f.pointer('pointerdown', 50, 50, {pointerId: 2});
            throw new Error('old capture failed');
        }
    };
    f.pointer('pointerdown');
    assert.equal(f.engine.getState().marqueeing, true);
    assert.equal(f.engine.getState().marquee, null);
    assert.deepEqual(f.engine.getState().selected, [5]);
    assert.deepEqual([...f.captures], [2]);
    assert.deepEqual(f.events.map(state => state.marqueeing), [false, false, true]);
    assert.equal(f.errors.length, 1);
    f.pointer('pointermove', 70, 70, {pointerId: 2});
    assert.deepEqual(f.engine.getState().selected, [1]);
});

test('selection capture release cannot roll back a newer reentrant selection when it throws', function (t) {
    const f = createFixture(t, {collectIndicesInRect: () => [2]});
    f.engine.select(5);
    f.pointer('pointerdown');
    f.pointer('pointermove', 120, 120);
    f.container.releasePointerCapture = id => {
        f.captures.delete(id);
        f.engine.select(4);
        throw new Error('release failed');
    };
    const before = f.events.length;
    f.pointer('pointerup');
    assert.deepEqual(selection(f.engine), {selected: [4], anchor: 4, focused: 4});
    assert.deepEqual(f.events.at(-1), f.engine.getState());
    assert.equal(f.events.length, before + 1);
    assert.equal(f.errors.length, 1);
});

test('selection capture release cannot roll back a replacement gesture when it throws', function (t) {
    const f = createFixture(t, {collectIndicesInRect: () => [2]});
    f.engine.select(5);
    f.pointer('pointerdown');
    f.pointer('pointermove', 120, 120);
    f.container.releasePointerCapture = id => {
        f.captures.delete(id);
        if (id === 1) {
            f.pointer('pointerdown', 50, 50, {pointerId: 2});
            throw new Error('old release failed');
        }
    };
    f.pointer('pointerup');
    assert.equal(f.engine.getState().marqueeing, true);
    assert.equal(f.engine.getState().marquee, null);
    assert.deepEqual(f.engine.getState().selected, [2]);
    assert.deepEqual([...f.captures], [2]);
    assert.deepEqual(f.events.at(-1), f.engine.getState());
    assert.equal(f.errors.length, 1);
    f.pointer('pointermove', 70, 70, {pointerId: 2});
    f.pointer('pointercancel', 70, 70, {pointerId: 2});
    assert.deepEqual(f.engine.getState().selected, [2]);
});

test('selection an already-restored release failure does not duplicate a reentrant settled delivery', function (t) {
    const f = createFixture(t, {collectIndicesInRect: () => [2]});
    f.engine.select(2);
    f.pointer('pointerdown');
    f.pointer('pointermove', 120, 120);
    f.container.releasePointerCapture = id => {
        f.captures.delete(id);
        f.engine.select(2);
        throw new Error('release failed');
    };
    const before = f.events.length;
    f.pointer('pointerup');
    assert.equal(f.events.length, before + 1);
    assert.deepEqual(f.events.at(-1), f.engine.getState());
    assert.deepEqual(selection(f.engine), {selected: [2], anchor: 2, focused: 2});
    assert.equal(f.errors.length, 1);
});

test('selection marquee reentrant cancellation cannot commit stale provider hits', function (t) {
    const f = createFixture(t, {collectIndicesInRect() { f.pointer('pointercancel'); return [2, 3]; }});
    f.engine.select(5);
    f.pointer('pointerdown');
    f.pointer('pointermove', 120, 120);
    assert.deepEqual(selection(f.engine), {selected: [5], anchor: 5, focused: 5});
    assert.equal(f.engine.getState().marqueeing, false);
    assert.ok(f.events.every(state => state.marquee === null));
});

test('selection marquee reentrant replacement gestures survive stale provider results and failures', function (t) {
    for (const throws of [false, true]) {
        let replace = true;
        const cause = new Error('old provider failed');
        const f = createFixture(t, {collectIndicesInRect() {
            if (replace) {
                replace = false;
                f.pointer('pointercancel');
                f.pointer('pointerdown', 50, 50, {pointerId: 2});
                if (throws) throw cause;
                return [4];
            }
            return [1];
        }});
        f.engine.select(5);
        f.pointer('pointerdown');
        f.pointer('pointermove', 120, 120);
        assert.equal(f.engine.getState().marqueeing, true);
        assert.equal(f.engine.getState().marquee, null);
        assert.deepEqual(f.engine.getState().selected, [5]);
        assert.equal(f.errors.length, throws ? 1 : 0);
        f.pointer('pointermove', 70, 70, {pointerId: 2});
        assert.deepEqual(f.engine.getState().selected, [1]);
    }
});

test('selection capture-error recovery publishes a reentrant selection only once', function (t) {
    const f = createFixture(t, {collectIndicesInRect: () => [2], onError() { f.engine.select(4); }});
    f.engine.select(5);
    f.pointer('pointerdown');
    f.pointer('pointermove', 120, 120);
    f.container.releasePointerCapture = () => { throw new Error('release failed'); };
    const before = f.events.length;
    f.pointer('pointerup');
    assert.deepEqual(selection(f.engine), {selected: [4], anchor: 4, focused: 4});
    assert.equal(f.events.length, before + 1);
    assert.deepEqual(f.events.at(-1), f.engine.getState());
});

test('selection malformed hit-test results fail inside the atomic marquee update', function (t) {
    const f = createFixture(t, {collectIndicesInRect: () => null});
    f.engine.select(5);
    f.pointer('pointerdown');
    f.pointer('pointermove', 120, 120);
    assert.deepEqual(selection(f.engine), {selected: [5], anchor: 5, focused: 5});
    assert.equal(f.engine.getState().marqueeing, false);
    assert.equal(f.errors[0].metadata.operation, 'marquee');
    assert.ok(f.errors[0].metadata.cause instanceof TypeError);
});
