import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture, selection} from './helpers/selection.ts';

test('selection plain clicks replace membership and set anchor and focus', function (t) {
    const f = createFixture(t);
    f.engine.select(4);
    assert.deepEqual(selection(f.engine), {selected: [4], anchor: 4, focused: 4});
    f.engine.select(1);
    assert.deepEqual(selection(f.engine), {selected: [1], anchor: 1, focused: 1});
    assert.equal(f.engine.isSelected(1), true);
    assert.equal(f.engine.isSelected(4), false);
    assert.equal(f.engine.getState().selectedCount, 1);
});

test('selection meta clicks toggle, including shift-meta without an anchor', function (t) {
    const f = createFixture(t);
    f.engine.select(4, {meta: true, shift: true});
    f.engine.select(1, {meta: true});
    assert.deepEqual(selection(f.engine), {selected: [1, 4], anchor: 1, focused: 1});
    f.engine.select(1, {meta: true});
    assert.deepEqual(selection(f.engine), {selected: [4], anchor: 1, focused: 1});
});

test('selection shift replaces a range while shift-meta adds to membership', function (t) {
    const f = createFixture(t);
    f.engine.select(5);
    f.engine.select(1, {meta: true});
    f.engine.select(3, {shift: true, meta: true});
    assert.deepEqual(selection(f.engine), {selected: [1, 2, 3, 5], anchor: 1, focused: 3});
    f.engine.select(2, {shift: true});
    assert.deepEqual(selection(f.engine), {selected: [1, 2], anchor: 1, focused: 2});
    f.engine.select(0, {shift: true});
    assert.deepEqual(selection(f.engine), {selected: [0, 1], anchor: 1, focused: 0});
});

test('selection shift without an anchor selects one item and establishes its anchor', function (t) {
    const f = createFixture(t);
    f.engine.setFocused(4);
    f.engine.select(2, {shift: true});
    assert.deepEqual(selection(f.engine), {selected: [2], anchor: 2, focused: 2});
});

test('selection range adds in either direction with its explicit anchor and focus', function (t) {
    const f = createFixture(t);
    f.engine.select(0);
    f.engine.selectRange(4, 2);
    assert.deepEqual(selection(f.engine), {selected: [0, 2, 3, 4], anchor: 4, focused: 2});
    f.engine.selectRange(1, 3);
    assert.deepEqual(selection(f.engine), {selected: [0, 1, 2, 3, 4], anchor: 1, focused: 3});
    f.engine.selectRange(5, 5);
    assert.deepEqual(selection(f.engine), {selected: [0, 1, 2, 3, 4, 5], anchor: 5, focused: 5});
});

test('selection deselect and selectAll preserve anchor and focus; clear preserves focus', function (t) {
    const f = createFixture(t);
    f.engine.select(3);
    f.engine.deselect(3);
    assert.deepEqual(selection(f.engine), {selected: [], anchor: 3, focused: 3});
    f.engine.selectAll();
    assert.deepEqual(selection(f.engine), {selected: [0, 1, 2, 3, 4, 5], anchor: 3, focused: 3});
    f.engine.clear();
    assert.deepEqual(selection(f.engine), {selected: [], anchor: null, focused: 3});
    f.engine.setFocused(null);
    assert.deepEqual(selection(f.engine), {selected: [], anchor: null, focused: null});
});

test('selection focus changes can identify unselected items without changing the anchor', function (t) {
    const requests = [];
    const f = createFixture(t, {onFocusRequest: request => requests.push(request)});
    f.engine.select(1);
    f.engine.setFocused(5);
    assert.deepEqual(selection(f.engine), {selected: [1], anchor: 1, focused: 5});
    f.engine.setFocused(null);
    assert.deepEqual(selection(f.engine), {selected: [1], anchor: 1, focused: null});
    assert.equal(requests.length, 0);
});

test('selection single mode replaces with clicks and toggle but ignores ranges and selectAll', function (t) {
    const f = createFixture(t, {mode: 'single'});
    f.engine.select(1);
    f.engine.select(4, {meta: true, shift: true});
    assert.deepEqual(selection(f.engine), {selected: [4], anchor: 4, focused: 4});
    f.engine.select(4, {meta: true});
    assert.deepEqual(f.engine.getState().selected, [4]);
    f.engine.toggle(2);
    assert.deepEqual(selection(f.engine), {selected: [2], anchor: 2, focused: 2});
    f.engine.toggle(2);
    assert.deepEqual(selection(f.engine), {selected: [], anchor: 2, focused: 2});
    const count = f.events.length;
    f.engine.selectRange(0, 5);
    f.engine.selectAll();
    assert.equal(f.events.length, count);
});

test('selection invalid indices are silent and do not resolve item keys', function (t) {
    const keys = [];
    const f = createFixture(t, {getItemKey: index => { keys.push(index); return index; }});
    for (const index of [-1, 6, 1.5, NaN, Infinity, null, undefined, '1', {}, false]) {
        f.engine.select(index);
        f.engine.toggle(index);
        f.engine.deselect(index);
        f.engine.selectRange(index, 1);
        f.engine.selectRange(1, index);
        f.engine.setFocused(index);
    }
    assert.deepEqual(keys, []);
    assert.equal(f.events.length, 1);
});

test('selection membership uses keys and numeric sorting rather than index or recency', function (t) {
    const keys = [100, 20, 3, 100, -1, 0];
    const f = createFixture(t, {getItemKey: index => keys[index]});
    f.engine.selectAll();
    assert.deepEqual(f.engine.getState().selected, [-1, 0, 3, 20, 100]);
    assert.equal(f.engine.getState().selectedCount, 5);
    assert.equal(f.engine.isSelected(1), false);
    assert.equal(f.engine.isSelected(20), true);
    f.engine.deselect(3);
    assert.equal(f.engine.isSelected(100), false);
    f.engine.select(0);
    f.engine.toggle(3);
    assert.equal(f.engine.getState().selectedCount, 0);
});

test('selection sorts string keys and resolves current index-to-key mappings', function (t) {
    const keys = ['c', 'a', 'b'];
    const f = createFixture(t, {count: keys.length, getItemKey: index => keys[index]});
    f.engine.selectAll();
    assert.deepEqual(f.engine.getState().selected, ['a', 'b', 'c']);
    f.engine.clear();
    f.engine.select(0);
    keys.reverse();
    assert.equal(f.engine.isSelected('c'), true);
    f.engine.deselect(2);
    assert.equal(f.engine.isSelected('c'), false);
});

for (const [operation, invoke] of [
    ['select', engine => engine.select(2)],
    ['toggle', engine => engine.toggle(2)],
    ['deselect', engine => engine.deselect(2)],
    ['select-range', engine => engine.selectRange(0, 4)],
    ['select-all', engine => engine.selectAll()],
]) {
    test(`selection ${operation} provider errors leave selection, anchor, and focus atomic`, function (t) {
        const cause = new Error('key failed');
        let fail = false;
        const f = createFixture(t, {getItemKey: index => { if (fail && index === 2) throw cause; return index; }});
        f.engine.select(5);
        const before = f.engine.getState();
        fail = true;
        invoke(f.engine);
        assert.deepEqual(f.engine.getState(), before);
        assert.equal(f.events.length, 2);
        assert.equal(f.errors.length, 1);
        assert.deepEqual(f.errors[0], {id: 'selection-update-failed', message: 'The selection could not be updated.', metadata: {operation, cause}});
        fail = false;
        f.engine.select(1);
        assert.deepEqual(f.engine.getState().selected, [1]);
    });
}

test('selection a provider cannot commit an older draft over a reentrant selection', function (t) {
    let reenter = false;
    const f = createFixture(t, {getItemKey(index) {
        if (reenter && index === 2) { reenter = false; f.engine.select(5); }
        return index;
    }});
    f.engine.select(0);
    reenter = true;
    f.engine.selectRange(1, 3);
    assert.deepEqual(selection(f.engine), {selected: [5], anchor: 5, focused: 5});
    assert.deepEqual(f.events.map(state => state.selected), [[], [0], [5]]);
});

test('selection onError may recover by selecting without publishing a failed draft', function (t) {
    const cause = new Error('key failed');
    const f = createFixture(t, {getItemKey(index) { if (index === 2) throw cause; return index; }, onError() { f.engine.select(4); }});
    f.engine.selectRange(0, 3);
    assert.deepEqual(selection(f.engine), {selected: [4], anchor: 4, focused: 4});
    assert.deepEqual(f.events.map(state => state.selected), [[], [4]]);
});
