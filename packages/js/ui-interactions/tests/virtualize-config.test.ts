import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createVirtualizer} from 'strata-packages/ui-interactions/virtualize';
import {createFixture, createHost, getIndices} from './helpers/virtualize.ts';

test('virtualize requires an options object and a grid with geometry and document capabilities', function () {
    for (const config of [undefined, null, false, 1, '', () => {}]) {
        assert.throws(() => createVirtualizer(config), /createVirtualizer.*options object/);
    }
    for (const gridElement of [undefined, null, false, {}, {getBoundingClientRect() {}}, {ownerDocument: {}}]) {
        assert.throws(() => createVirtualizer({gridElement}), /createVirtualizer.*gridElement.*DOM element/);
    }
});

const invalidOptions = {
    onChange: [null, false, 0, '', [], {}],
    onError: [null, false, 0, '', [], {}],
    count: [null, false, '5', -1, 1.5, NaN, Infinity, -Infinity],
    getItemKey: [null, false, 1, '', [], {}],
    strategy: [null, false, 1, '', 'window'],
    threshold: [null, false, '5', -1, 1.5, NaN, Infinity, -Infinity],
    scrollElement: [null, false, 1, {}, {getBoundingClientRect: true}],
    overscan: [null, false, '5', -1, 1.5, NaN, Infinity, -Infinity],
};

for (const [name, values] of Object.entries(invalidOptions)) {
    test(`virtualize rejects malformed ${name} before registering resources`, function () {
        for (const value of values) {
            const host = createHost();
            assert.throws(() => createVirtualizer({gridElement: host.gridElement, [name]: value}), error => {
                assert.equal(error.name, 'TypeError');
                assert.ok(error.message.startsWith('createVirtualizer:'));
                assert.ok(error.message.includes(`'${name}'`));
                return true;
            });
            assert.equal(host.gridElement.registrations.length, 0);
            assert.equal(host.observers.length, 0);
        }
    });
}

test('virtualize publishes one synchronous initial state with default empty CSS behavior', function (t) {
    const f = createFixture(t, {}, createHost({hasCell: false, style: {gridTemplateColumns: 'none'}}));
    assert.deepEqual(f.events, [{
        strategy: 'css', items: [], totalSize: null, containerStyle: {},
        columns: 1, cellWidth: 0, cellHeight: 0, count: 0,
    }]);
    assert.deepEqual(f.engine.getState(), f.events[0]);
    assert.equal(f.frames.size, 0);
});

test('virtualize resolves auto strictly above the threshold and honors explicit strategies', function (t) {
    for (const [options, expected] of [
        [{count: 1500}, 'css'], [{count: 1501}, 'virtual'],
        [{count: 0, threshold: 0}, 'css'], [{count: 1, threshold: 0}, 'virtual'],
        [{count: 3, threshold: 3}, 'css'], [{count: 4, threshold: 3}, 'virtual'],
        [{count: 4, threshold: 0, strategy: 'css'}, 'css'],
        [{count: 0, threshold: 100, strategy: 'virtual'}, 'virtual'],
    ]) {
        const f = createFixture(t, options);
        assert.equal(f.engine.getState().strategy, expected);
        assert.equal(f.events.length, 1);
    }
});

test('virtualize uses index keys by default and accepts custom string and number keys', function (t) {
    const f = createFixture(t, {count: 3});
    assert.deepEqual(f.engine.getState().items.map(item => item.key), [0, 1, 2]);
    const keyed = createFixture(t, {count: 3, getItemKey: index => ['a', 0, '0'][index]});
    assert.deepEqual(keyed.events[0].items.map(item => item.key), ['a', 0, '0']);
    assert.deepEqual(getIndices(keyed.events[0]), [0, 1, 2]);
});

test('virtualize can construct without callbacks or ResizeObserver and validates subscriptions', function (t) {
    const host = createHost({resizeObserver: false});
    const engine = createVirtualizer({gridElement: host.gridElement, count: 2, onChange: undefined, onError: undefined});
    t.after(() => engine.destroy());
    assert.equal(engine.getState().items.length, 2);
    assert.equal(host.observers.length, 0);
    const received = [];
    engine.subscribe(state => received.push(state));
    for (const listener of [undefined, null, false, 1, '', {}]) {
        assert.throws(() => engine.subscribe(listener), /listener.*function/);
    }
    host.scrollTo(220);
    host.flushFrames();
    assert.deepEqual(received, []);
});
