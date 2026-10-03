import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture, createHost, getIndices} from './helpers/virtualize.ts';

test('virtualize reads resolved equal tracks and first-cell aspect into CSS and grid-local rectangles', function (t) {
    const f = createFixture(t, {count: 5}, createHost({
        style: {gridTemplateColumns: '80px 80px 80px'}, cellRect: {width: 200, height: 100},
    }));
    const state = f.engine.getState();
    assert.equal(state.columns, 3);
    assert.equal(state.cellWidth, 80);
    assert.equal(state.cellHeight, 40);
    assert.equal(state.totalSize, null);
    assert.equal('range' in state, false);
    assert.deepEqual(state.containerStyle, {gridAutoRows: '40px'});
    assert.deepEqual(state.items[0], {key: 0, index: 0, start: null, size: null, style: {contentVisibility: 'auto', containIntrinsicSize: '80px 40px'}});
    assert.deepEqual(f.engine.getItemRect(4), {top: 50, left: 100, width: 80, height: 40});
    assert.deepEqual(f.styleReads, [f.gridElement]);
});

test('virtualize falls back to a measured list cell and treats normal gaps as zero', function (t) {
    const f = createFixture(t, {count: 3}, createHost({
        style: {gridTemplateColumns: 'none', rowGap: 'normal', columnGap: 'normal'},
        cellRect: {width: 80, height: 40},
    }));
    assert.equal(f.engine.getState().columns, 1);
    assert.deepEqual(f.engine.getItemRect(2), {top: 80, left: 0, width: 80, height: 40});
    assert.equal(f.engine.getState().items[0].style.containIntrinsicSize, '80px 40px');
});

test('virtualize caches the first measurable aspect across resize and cell removal', function (t) {
    const f = createFixture(t, {count: 2}, createHost({hasCell: false}));
    assert.equal(f.engine.getState().cellHeight, 100);
    assert.deepEqual(f.engine.getState().containerStyle, {});
    f.cellRect.width = 0;
    f.cellRect.height = 0;
    f.gridElement.firstElementChild = f.firstCell;
    f.resize();
    assert.equal(f.events.length, 1);
    f.cellRect.width = 100;
    f.cellRect.height = 50;
    f.resize();
    assert.equal(f.engine.getState().cellHeight, 50);
    assert.deepEqual(f.engine.getState().containerStyle, {gridAutoRows: '50px'});
    f.cellRect.width = 900;
    f.cellRect.height = 900;
    f.style.gridTemplateColumns = '150px 150px';
    f.resize();
    assert.equal(f.engine.getState().cellHeight, 75);
    f.gridElement.firstElementChild = null;
    f.style.gridTemplateColumns = '80px';
    f.resize();
    assert.equal(f.engine.getState().cellHeight, 40);
    assert.equal(f.engine.getState().columns, 1);
});

test('virtualize keeps raw positioning precision while publishing dimensions rounded to cents', function (t) {
    const f = createFixture(t, {count: 4});
    f.style.gridTemplateColumns = '100.004px 100.004px';
    f.resize();
    assert.equal(f.events.length, 1);
    assert.equal(f.engine.getState().cellWidth, 100);
    assert.equal(f.engine.getState().cellHeight, 100);
    assert.deepEqual(f.engine.getItemRect(3), {top: 110.004, left: 120.004, width: 100.004, height: 100.004});
    f.style.rowGap = '15px';
    f.style.columnGap = '25px';
    f.resize();
    assert.equal(f.events.length, 1);
    assert.deepEqual(f.engine.getItemRect(3), {top: 115.004, left: 125.004, width: 100.004, height: 100.004});
});

test('virtualize computes windows, overscan, padding and total height including a partial final row', function (t) {
    for (const [count, overscan, scrollTop, startIndex, endIndex, totalSize, paddingTop, paddingBottom] of [
        [0, 1, 440, 0, -1, 0, 0, 0],
        [1, 0, 0, 0, 0, 100, 0, 0],
        [5, 0, 0, 0, 4, 320, 0, 0],
        [40, 0, 0, 0, 5, 2190, 0, 1870],
        [40, 1, 0, 0, 7, 2190, 0, 1760],
        [40, 1, 440, 6, 15, 2190, 330, 1320],
        [40, 1, 10000, 36, 39, 2190, 1980, 0],
    ]) {
        const f = createFixture(t, {count, strategy: 'virtual', overscan}, createHost({scrollTop}));
        const state = f.engine.getState();
        assert.deepEqual(state.range, {startIndex, endIndex});
        assert.deepEqual(getIndices(state), Array.from({length: endIndex - startIndex + 1}, (_, i) => startIndex + i));
        assert.equal(state.totalSize, totalSize);
        assert.deepEqual(state.containerStyle, {gridAutoRows: '100px', paddingTop: `${paddingTop}px`, paddingBottom: `${paddingBottom}px`});
        for (const item of state.items) assert.deepEqual(item, {key: item.index, index: item.index, start: null, size: null, style: {}});
    }
});

test('virtualize preserves the default three overscan rows and finite zero-geometry windows', function (t) {
    const f = createFixture(t, {count: 40, strategy: 'virtual'});
    assert.deepEqual(f.engine.getState().range, {startIndex: 0, endIndex: 11});
    for (const strategy of ['css', 'virtual']) {
        const emptyGeometry = createFixture(t, {count: 5, strategy, overscan: 0}, createHost({
            hasCell: false, style: {gridTemplateColumns: 'none', rowGap: 'normal', columnGap: 'normal'},
        }));
        const state = emptyGeometry.engine.getState();
        assert.equal(state.cellWidth, 0);
        assert.equal(state.cellHeight, 0);
        assert.deepEqual(emptyGeometry.engine.getItemRect(4), {top: 0, left: 0, width: 0, height: 0});
        assert.deepEqual(emptyGeometry.engine.getIndicesInRect({x: 0, y: 0, width: 100, height: 100}), []);
        if (strategy === 'virtual') {
            assert.equal(state.totalSize, 0);
            assert.deepEqual(state.range, {startIndex: 0, endIndex: 0});
            assert.deepEqual(state.containerStyle, {gridAutoRows: '0px', paddingTop: '0px', paddingBottom: '0px'});
        } else {
            assert.deepEqual(state.items[0].style, {contentVisibility: 'auto'});
            assert.deepEqual(state.containerStyle, {});
        }
    }
});

test('virtualize hit tests existing row/column buckets, including gaps and touching edges, within the item count', function (t) {
    const cases = [
        [{x: 0, y: 0, width: 99, height: 99}, [0]],
        [{x: 120, y: 110, width: 90, height: 90}, [3]],
        [{x: 115, y: 105, width: 1, height: 1}, [0]],
        [{x: 100, y: 100, width: 20, height: 10}, [0, 1, 2, 3]],
        [{x: -10, y: -10, width: 9, height: 9}, []],
        [{x: -10, y: -10, width: 20, height: 20}, [0]],
        [{x: 240, y: 0, width: 100, height: 100}, []],
        [{x: 0, y: 330, width: 220, height: 100}, []],
        [{x: 120, y: 220, width: 100, height: 100}, []],
        [{x: 0, y: 0, width: 220, height: 1e9}, [0, 1, 2, 3, 4]],
    ];
    for (const strategy of ['css', 'virtual']) {
        const f = createFixture(t, {count: 5, strategy, overscan: 0});
        for (const [rect, expected] of cases) assert.deepEqual(f.engine.getIndicesInRect(rect), expected);
    }
    const empty = createFixture(t, {count: 0});
    assert.deepEqual(empty.engine.getIndicesInRect({x: 0, y: 0, width: 220, height: 1e9}), []);
});
