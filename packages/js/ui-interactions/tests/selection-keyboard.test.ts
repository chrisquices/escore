import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture, createContainer, selection} from './helpers/selection.ts';

for (const [key, expected] of [['ArrowRight', 0], ['ArrowDown', 0], ['ArrowLeft', 5], ['ArrowUp', 5]]) {
    test(`selection ${key} starts navigation at the correct end when focus is unset`, function (t) {
        const requests = [];
        const f = createFixture(t, {onFocusRequest: request => requests.push(request)});
        const event = f.key(key);
        assert.equal(event.defaultPrevented, true);
        assert.deepEqual(selection(f.engine), {selected: [expected], anchor: expected, focused: expected});
        assert.deepEqual(requests, [{index: expected, event}]);
    });
}

test('selection list arrows move one item and still request DOM focus at unchanged boundaries', function (t) {
    const requests = [];
    const f = createFixture(t, {onFocusRequest: request => requests.push(request.index)});
    f.engine.select(0);
    const before = f.events.length;
    f.key('ArrowUp');
    f.key('ArrowLeft');
    assert.equal(f.events.length, before);
    assert.deepEqual(requests, [0, 0]);
    f.key('ArrowDown');
    f.key('ArrowRight');
    assert.equal(f.engine.getState().focused, 2);
    f.key('ArrowLeft');
    f.key('ArrowUp');
    assert.equal(f.engine.getState().focused, 0);
    f.engine.select(5);
    f.key('ArrowDown');
    f.key('ArrowRight');
    assert.equal(f.engine.getState().focused, 5);
    assert.deepEqual(requests.slice(-2), [5, 5]);
});

test('selection grid arrows preserve rows at top/bottom, clamp partial rows, and cross columns horizontally', function (t) {
    const f = createFixture(t, {count: 8, calculateColumnCount: () => 3});
    for (const [from, key, expected] of [
        [1, 'ArrowUp', 1], [2, 'ArrowDown', 5], [5, 'ArrowDown', 7],
        [7, 'ArrowDown', 7], [7, 'ArrowUp', 4], [2, 'ArrowRight', 3],
        [3, 'ArrowLeft', 2], [0, 'ArrowLeft', 0], [7, 'ArrowRight', 7],
    ]) {
        f.engine.select(from);
        f.key(key);
        assert.deepEqual(selection(f.engine), {selected: [expected], anchor: expected, focused: expected}, `${from} ${key}`);
    }
});

test('selection derives columns from rendered first-row geometry instead of the column provider', function (t) {
    const host = createContainer({count: 8, columns: 3});
    host.items[1].box.y = 1;
    const f = createFixture(t, {itemSelector: '.item', calculateColumnCount: () => assert.fail('DOM layout supplies columns')}, host);
    f.engine.select(1);
    f.key('ArrowDown');
    assert.equal(f.engine.getState().focused, 4);
    host.items[2].box.y = 2;
    f.engine.select(1);
    f.key('ArrowDown');
    assert.equal(f.engine.getState().focused, 3);
    for (const item of host.items) item.item = false;
    f.key('ArrowDown');
    assert.equal(f.engine.getState().focused, 4);
});

test('selection shift arrows extend from anchor, shrink ranges, and establish a missing anchor from prior focus', function (t) {
    const f = createFixture(t);
    f.engine.setFocused(2);
    f.key('ArrowRight', {shiftKey: true, metaKey: true});
    assert.deepEqual(selection(f.engine), {selected: [2, 3], anchor: 2, focused: 3});
    f.key('ArrowRight', {shiftKey: true});
    assert.deepEqual(selection(f.engine), {selected: [2, 3, 4], anchor: 2, focused: 4});
    f.key('ArrowLeft', {shiftKey: true});
    assert.deepEqual(selection(f.engine), {selected: [2, 3], anchor: 2, focused: 3});
    f.engine.clear();
    f.engine.setFocused(null);
    f.key('ArrowUp', {shiftKey: true});
    assert.deepEqual(selection(f.engine), {selected: [5], anchor: 5, focused: 5});
    f.key('ArrowLeft');
    assert.deepEqual(selection(f.engine), {selected: [4], anchor: 4, focused: 4});
});

test('selection single mode ignores shift extension while arrows select and Space toggles', function (t) {
    const f = createFixture(t, {mode: 'single'});
    f.engine.select(2);
    f.key('ArrowRight', {shiftKey: true});
    assert.deepEqual(selection(f.engine), {selected: [3], anchor: 3, focused: 3});
    assert.equal(f.key(' ', {shiftKey: true}).defaultPrevented, true);
    assert.deepEqual(selection(f.engine), {selected: [], anchor: 3, focused: 3});
    f.key(' ');
    assert.deepEqual(f.engine.getState().selected, [3]);
    assert.equal(f.key('a', {ctrlKey: true}).defaultPrevented, true);
    assert.deepEqual(f.engine.getState().selected, [3]);
});

test('selection Space needs focus and select-all supports Command/Ctrl and either case', function (t) {
    const f = createFixture(t);
    assert.equal(f.key(' ').defaultPrevented, false);
    for (const [key, modifier] of [['a', 'metaKey'], ['A', 'ctrlKey']]) {
        f.engine.clear();
        assert.equal(f.key(key, {[modifier]: true}).defaultPrevented, true);
        assert.deepEqual(selection(f.engine), {selected: [0, 1, 2, 3, 4, 5], anchor: null, focused: null});
    }
    f.engine.setFocused(3);
    f.key(' ');
    assert.deepEqual(selection(f.engine), {selected: [0, 1, 2, 4, 5], anchor: 3, focused: 3});
});

test('selection Enter supplies an independent current state and event without selecting', function (t) {
    const enters = [];
    const f = createFixture(t, {onEnter: context => { enters.push(context); context.state.selected.push(99); }});
    f.engine.select(2);
    f.engine.setFocused(4);
    const before = f.engine.getState();
    const event = f.key('Enter');
    assert.equal(event.defaultPrevented, true);
    assert.equal(enters[0].event, event);
    assert.equal(enters[0].state.focused, 4);
    assert.deepEqual(f.engine.getState(), before);
    assert.equal(f.events.length, 3);
    const empty = createFixture(t, {count: 0, onEnter: context => enters.push(context)});
    assert.equal(empty.key('Enter').defaultPrevented, true);
    assert.equal(enters.length, 2);
});

test('selection idle Escape clears membership and anchor without preventing default or clearing focus', function (t) {
    const f = createFixture(t);
    f.engine.select(3);
    assert.equal(f.key('Escape').defaultPrevented, false);
    assert.deepEqual(selection(f.engine), {selected: [], anchor: null, focused: 3});
    assert.equal(f.key('Enter').defaultPrevented, false);
    for (const key of ['a', 'A', 'Tab', 'Home', 'End', 'x']) assert.equal(f.key(key).defaultPrevented, false);
    assert.equal(f.events.length, 3);
});

test('selection empty collections ignore arrows, Space and select-all', function (t) {
    const f = createFixture(t, {count: 0});
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'a']) {
        assert.equal(f.key(key, {ctrlKey: true}).defaultPrevented, false);
    }
    assert.equal(f.events.length, 1);
});

test('selection synchronizes initial and later native focus from item descendants without selection', function (t) {
    const host = createContainer();
    const child = host.createElement({}, host.items[3]);
    host.ownerDocument.activeElement = child;
    const requests = [];
    const f = createFixture(t, {itemSelector: '.item', onFocusRequest: request => requests.push(request)}, host);
    assert.equal(f.events.length, 1);
    assert.deepEqual(selection(f.engine), {selected: [], anchor: null, focused: 3});
    f.dispatch('focusin', {target: host.items[1]});
    assert.deepEqual(selection(f.engine), {selected: [], anchor: null, focused: 1});
    f.dispatch('focusin', {target: host.container});
    f.dispatch('focusin', {target: null});
    f.dispatch('focusin', {target: {}});
    f.dispatch('focusin', {target: host.createElement({item: true})});
    assert.equal(f.events.length, 2);
    assert.equal(requests.length, 0);
});

test('selection initial native focus reentrancy delivers the newest focus only once', function (t) {
    const host = createContainer();
    host.ownerDocument.activeElement = host.items[3];
    const f = createFixture(t, {itemSelector: '.item', onChange(state) {
        if (state.focused === 3) host.dispatch('focusin', {target: host.items[1]});
    }}, host);
    assert.deepEqual(f.events.map(state => state.focused), [3, 1]);
    assert.equal(f.engine.getState().focused, 1);
});

test('selection native focus tracking remains active with keyboard disabled and filters indices beyond count', function (t) {
    const f = createFixture(t, {itemSelector: '.item', keyboard: false, count: 2});
    f.dispatch('focusin', {target: f.items[1]});
    f.dispatch('focusin', {target: f.items[3]});
    assert.equal(f.engine.getState().focused, 1);
    assert.equal(f.key('ArrowRight').defaultPrevented, false);
    assert.deepEqual(f.engine.getState().selected, []);
});

for (const properties of [
    {tag: 'button'}, {tag: 'a', attributes: {href: '#'}}, {tag: 'input'}, {tag: 'textarea'},
    {tag: 'select'}, {tag: 'option'}, {tag: 'label'}, {tag: 'summary'},
    {tag: 'audio', attributes: {controls: ''}}, {tag: 'video', attributes: {controls: ''}},
    ...['button', 'link', 'checkbox', 'radio', 'switch', 'textbox', 'searchbox', 'combobox', 'listbox', 'slider', 'spinbutton', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio'].map(role => ({attributes: {role}})),
    {attributes: {contenteditable: 'true'}},
]) {
    test(`selection preserves keys owned by nested ${properties.tag || properties.attributes.role || 'editable'} controls`, function (t) {
        const f = createFixture(t, {itemSelector: '.item'});
        const control = f.createElement(properties, f.items[0]);
        const child = f.createElement({}, control);
        for (const key of ['ArrowRight', ' ', 'Enter', 'Escape', 'a']) {
            assert.equal(f.key(key, {target: child, ctrlKey: true}).defaultPrevented, false);
        }
        assert.equal(f.events.length, 1);
    });
}

test('selection allows item-root controls, plain descendants, container controls and targets without closest', function (t) {
    const f = createFixture(t, {itemSelector: '.item'});
    f.items[0].tag = 'button';
    const child = f.createElement({}, f.items[0]);
    assert.equal(f.key('ArrowRight', {target: child}).defaultPrevented, true);
    f.container.tag = 'button';
    assert.equal(f.key('ArrowRight').defaultPrevented, true);
    assert.equal(f.key('ArrowRight', {target: {}}).defaultPrevented, true);
    assert.equal(f.key('ArrowRight', {target: null}).defaultPrevented, true);
    const outside = f.createElement({tag: 'button'});
    assert.equal(f.key('ArrowRight', {target: outside}).defaultPrevented, true);
    assert.equal(f.engine.getState().focused, 4);
});

test('selection editable item roots keep their native keyboard behavior', function (t) {
    const f = createFixture(t, {itemSelector: '.item'});
    for (const attributes of [{role: 'textbox'}, {role: 'searchbox'}, {role: 'combobox'}, {contenteditable: ''}]) {
        f.items[0].attributes = attributes;
        assert.equal(f.key('ArrowRight', {target: f.items[0]}).defaultPrevented, false);
    }
    for (const tag of ['input', 'textarea', 'select', 'option']) {
        f.items[0].attributes = {};
        f.items[0].tag = tag;
        assert.equal(f.key('ArrowRight', {target: f.items[0]}).defaultPrevented, false);
    }
    assert.equal(f.events.length, 1);
});

test('selection ignores already-handled keyboard events', function (t) {
    const f = createFixture(t);
    f.key('ArrowRight', {defaultPrevented: true});
    assert.equal(f.events.length, 1);
});

for (const value of [0, -1, 1.5, NaN, Infinity, '3', null]) {
    test(`selection rejects invalid resolved column count ${String(value)} atomically`, function (t) {
        const requests = [];
        const f = createFixture(t, {calculateColumnCount: () => value, onFocusRequest: request => requests.push(request)});
        f.engine.select(2);
        const before = f.engine.getState();
        assert.equal(f.key('ArrowDown').defaultPrevented, true);
        assert.deepEqual(f.engine.getState(), before);
        assert.equal(f.errors[0].metadata.operation, 'keyboard');
        assert.ok(f.errors[0].metadata.cause instanceof TypeError);
        assert.equal(requests.length, 0);
        assert.equal(f.events.length, 2);
    });
}

test('selection keyboard and focus selector failures report without partial updates', function (t) {
    const cause = new Error('selector failed');
    const f = createFixture(t, {itemSelector: '.item'});
    const bad = {closest() { throw cause; }};
    f.dispatch('focusin', {target: bad});
    f.key('ArrowRight', {target: bad});
    f.container.querySelectorAll = () => { throw cause; };
    f.key('ArrowRight');
    assert.deepEqual(f.errors.map(error => error.metadata.operation), ['focus', 'keyboard', 'keyboard']);
    assert.ok(f.errors.every(error => error.metadata.cause === cause));
    assert.equal(f.events.length, 1);
});

test('selection reentrant column resolution preserves newer focus and suppresses the abandoned focus request', function (t) {
    const requests = [];
    const f = createFixture(t, {calculateColumnCount() { f.engine.setFocused(5); return 1; }, onFocusRequest: request => requests.push(request)});
    f.engine.select(1);
    f.key('ArrowRight');
    assert.deepEqual(selection(f.engine), {selected: [1], anchor: 1, focused: 5});
    assert.equal(requests.length, 0);
});

test('selection isolates Enter, focus-request, and error consumer exceptions', function (t) {
    const logged = t.mock.method(console, 'error', () => {});
    let fail = false;
    const f = createFixture(t, {
        onEnter() { throw new Error('enter failed'); },
        onFocusRequest() { throw new Error('focus failed'); },
        onError() { throw new Error('report failed'); },
        calculateColumnCount() { if (fail) throw new Error('columns failed'); return 1; },
    });
    f.key('Enter');
    f.key('ArrowRight');
    fail = true;
    f.key('ArrowRight');
    assert.equal(logged.mock.callCount(), 3);
    assert.deepEqual(selection(f.engine), {selected: [0], anchor: 0, focused: 0});
});
