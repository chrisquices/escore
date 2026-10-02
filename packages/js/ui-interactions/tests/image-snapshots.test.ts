import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture, addTestLayer, createOperation, modifiers} from './helpers/image.ts';

function createLargeOperation(type, count, y = 0) {
    return {...createOperation(type), points: Array.from({length: count}, function (_, x) { return {x: x, y: y}; })};
}

function validateCheapUpdates(pointCount, update) {
    const map = Array.prototype.map;
    const stringify = JSON.stringify;
    // Guard actual work, without timing thresholds or changing the engine to expose its internals.
    Array.prototype.map = function (callback, receiver) {
        assert.notEqual(this.length, pointCount, "an old stroke's points were recopied");
        return map.call(this, callback, receiver);
    };
    JSON.stringify = function () {
        assert.fail("routine notifications must not serialize document history");
    };

    try {
        update();
    } finally {
        Array.prototype.map = map;
        JSON.stringify = stringify;
    }
}

test("120 pan/zoom frames reuse 160,000 operation points and frozen selections", function (t) {
    const f = createFixture(t);
    const id = addTestLayer(f);
    f.engine.setSelection({type: "rectangle", x: 0, y: 0, width: 20, height: 20});
    for (const modifier of modifiers) {
        f.engine["createLayer" + modifier.name](id);
        f.engine["addLayer" + modifier.name + "Operation"](id, createLargeOperation(modifier.type, 20000));
        f.engine["addLayer" + modifier.name + "Operation"](id, createLargeOperation(modifier.type, 20000, 1));
    }
    f.engine.setZoom(2);
    const before = f.events.at(-1);
    f.events.length = 0;
    f.dispatchPointer("pointerdown", 1, 100, 100);
    validateCheapUpdates(20000, function () {
        for (let frame = 0; frame < 120; frame++) {
            for (let move = 1; move <= 25; move++) f.dispatchPointer("pointermove", 1, 100 + frame * 25 + move, 100 + frame * 25 + move);
            assert.equal(f.pending.size, 1);
            f.flushFrames();
            assert.equal(f.events.at(-1).layers, before.layers);
            assert.equal(f.events.at(-1).selection, before.selection);
        }
        assert.equal(f.events.length, 120);
        for (let index = 0; index < 5; index++) f.dispatch(f.viewport, "wheel", {deltaY: 100, clientX: 300, clientY: 250});
        f.flushFrames();
        assert.equal(f.events.length, 121);
        assert.equal(f.events.at(-1).layers, before.layers);
        for (const modifier of modifiers) {
            f.engine["undoLayer" + modifier.name](id);
            assert.equal(f.events.at(-1).layers[0][modifier.key].operations[0], before.layers[0][modifier.key].operations[0]);
            f.engine["redoLayer" + modifier.name](id);
            assert.equal(f.events.at(-1).layers[0][modifier.key].operations[1], before.layers[0][modifier.key].operations[1]);
        }
    });
    const state = f.engine.getState();
    assert.deepEqual(state, f.events.at(-1));
    assert.notEqual(state.layers, before.layers);
    assert.notEqual(state.layers[0].paint.operations[0].points, before.layers[0].paint.operations[0].points);
});

test("stroke 500 copies only the new payload and branching retains the correct frozen prefix", function (t) {
    const f = createFixture(t);
    const id = addTestLayer(f);
    f.engine.setSelection({type: "lasso", points: [{x: 0, y: 0}, {x: 30, y: 0}, {x: 10, y: 30}]});
    for (let index = 0; index < 499; index++) {
        f.engine.addLayerPaintOperation(id, createLargeOperation("brush", 200, index));
        f.events.splice(0, f.events.length - 1);
    }
    const before = f.events.at(-1).layers[0].paint.operations;
    validateCheapUpdates(200, function () {
        f.engine.addLayerPaintOperation(id, createOperation("brush", 500));
        const after = f.events.at(-1).layers[0].paint.operations;
        assert.equal(after.length, 500);
        for (let index = 0; index < before.length; index++) {
            assert.equal(after[index], before[index]);
            assert.equal(after[index].points, before[index].points);
            assert.equal(after[index].selection, before[index].selection);
        }
        assert.notEqual(after[499], before[498]);
        f.engine.undoLayerPaint(id);
        assert.equal(f.events.at(-1).layers[0].paint.operations.length, 499);
        f.engine.redoLayerPaint(id);
        assert.equal(f.events.at(-1).layers[0].paint.operations[499], after[499]);
        f.engine.undoLayerPaint(id);
        f.engine.addLayerPaintOperation(id, createOperation("pencil", 600));
        const branched = f.events.at(-1).layers[0].paint;
        assert.equal(branched.operations.length, 500);
        assert.equal(branched.operations[0], before[0]);
        assert.equal(branched.operations[499].type, "pencil");
        assert.notEqual(branched.operations[499], after[499]);
        assert.equal(branched.canRedo, false);
        assert.equal(after[499].type, "brush");
    });
});

test("large committed sessions restore cached payloads and a load creates independent replacements", function (t) {
    const f = createFixture(t);
    const id = addTestLayer(f, {source: "asset:source"});
    f.engine.load(f.engine.serialize());
    f.engine.beginTransaction();
    for (let index = 0; index < 64; index++) {
        f.engine.addLayerLiquifyOperation(id, createLargeOperation("push", 500, index));
        f.events.splice(0, f.events.length - 1);
    }
    f.engine.commitTransaction();
    const operations = f.events.at(-1).layers[0].liquify.operations;
    validateCheapUpdates(500, function () {
        f.engine.undo();
        assert.equal(f.events.at(-1).layers[0].liquify, null);
        assert.equal(f.engine.canUndo(), false);
        f.engine.redo();
        for (let index = 0; index < operations.length; index++) assert.equal(f.events.at(-1).layers[0].liquify.operations[index], operations[index]);
        f.engine.beginTransaction();
        f.engine.addLayerLiquifyOperation(id, createOperation("bloat"));
        f.engine.cancelTransaction();
        assert.equal(f.events.at(-1).layers[0].liquify.operations.length, 64);
        assert.equal(f.events.at(-1).layers[0].liquify.operations[0], operations[0]);
        f.engine.resolveLayerSource(id, f.createCanvas());
        assert.equal(f.events.at(-1).layers[0].liquify.operations[0], operations[0]);
    });
    const data = f.engine.serialize();
    data.layers[0].liquify.operations[0].points[0].x = 123;
    f.engine.load(data);
    const loaded = f.events.at(-1).layers[0].liquify.operations[0];
    assert.notEqual(loaded, operations[0]);
    assert.equal(loaded.points[0].x, 123);
    assert.equal(operations[0].points[0].x, 0);
    data.layers[0].liquify.operations[0].points[0].x = 999;
    assert.equal(loaded.points[0].x, 123);
});
