import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture, addTestLayer, createOperation, modifiers} from './helpers/image.ts';

test("global undo/redo restores document state without restoring view navigation", function (t) {
    const f = createFixture(t);
    const id = addTestLayer(f);
    f.engine.setLayerOpacity(id, 0.4);
    f.engine.setZoom(2);
    f.engine.setPan(30, 40);
    f.events.length = 0;
    assert.equal(f.engine.undo(), true);
    assert.equal(f.events.length, 1);
    assert.equal(f.events[0].layers[0].opacity, 1);
    assert.equal(f.events[0].scale, 2);
    assert.equal(f.events[0].offsetX, 30);
    assert.equal(f.events[0].offsetY, 40);
    assert.equal(f.engine.redo(), true);
    assert.equal(f.events.length, 2);
    assert.equal(f.events[1].layers[0].opacity, 0.4);
    f.engine.undo();
    f.engine.setCanvasBackground("white");
    assert.equal(f.engine.canRedo(), false);
    assert.equal(f.engine.redo(), false);
});

test("a transaction commits one global entry containing complete local histories", function (t) {
    const f = createFixture(t);
    const id = addTestLayer(f, {source: "asset:source"});
    f.engine.load(f.engine.serialize());
    const before = f.engine.serialize();
    assert.equal(f.engine.beginTransaction(), true);
    assert.equal(f.engine.beginTransaction(), false);
    for (const modifier of modifiers) {
        f.engine["createLayer" + modifier.name](id);
        f.engine["addLayer" + modifier.name + "Operation"](id, createOperation(modifier.type, 10));
        f.engine["addLayer" + modifier.name + "Operation"](id, createOperation(modifier.type, 20));
        f.engine["undoLayer" + modifier.name](id);
    }
    f.engine.setCanvasBackground("white");
    f.engine.setCrop({x: 4, y: 5, width: 60, height: 70});
    f.engine.setSelection({type: "lasso", points: [{x: 0, y: 0}, {x: 30, y: 0}, {x: 10, y: 30}]});
    f.engine.setStraighten(10);
    const after = f.engine.serialize();
    assert.equal(f.engine.undo(), false);
    assert.equal(f.engine.redo(), false);
    assert.equal(f.engine.commitTransaction(), true);
    assert.equal(f.engine.canUndo(), true);
    assert.equal(f.engine.undo(), true);
    assert.deepEqual(f.engine.serialize(), before);
    assert.equal(f.engine.canUndo(), false);
    assert.equal(f.engine.redo(), true);
    assert.deepEqual(f.engine.serialize(), after);
    for (const modifier of modifiers) assert.equal(f.engine["canRedoLayer" + modifier.name](id), true);
});

test("cancel restores the original document and local redo branch without creating history", function (t) {
    const f = createFixture(t);
    const id = addTestLayer(f, {source: "asset:source"});
    f.engine.addLayerPaintOperation(id, createOperation("brush", 10));
    f.engine.addLayerPaintOperation(id, createOperation("brush", 20));
    f.engine.undoLayerPaint(id);
    f.engine.load(f.engine.serialize());
    const before = f.engine.serialize();
    f.engine.beginTransaction();
    f.engine.addLayerPaintOperation(id, createOperation("brush", 30));
    f.engine.setCanvasSize(200, 300);
    f.engine.removeLayer(id);
    f.events.length = 0;
    assert.equal(f.engine.cancelTransaction(), true);
    assert.equal(f.events.length, 1);
    assert.deepEqual(f.engine.serialize(), before);
    assert.equal(f.engine.canUndo(), false);
    assert.equal(f.engine.canRedo(), false);
    assert.equal(f.engine.canRedoLayerPaint(id), true);
    assert.equal(f.engine.redoLayerPaint(id), true);
    assert.equal(f.engine.getState().layers[0].paint.operations[1].points[0].x, 20);
    assert.equal(f.engine.cancelTransaction(), false);
});

for (const modifier of modifiers) {
    test(modifier.name + " atomic operations and local undo/redo preserve the global redo stack", function (t) {
        const f = createFixture(t);
        const id = addTestLayer(f);
        f.engine["createLayer" + modifier.name](id);
        f.engine.setCanvasBackground("white");
        f.engine.undo();
        assert.equal(f.engine.canRedo(), true);
        f.engine["addLayer" + modifier.name + "Operation"](id, createOperation(modifier.type));
        assert.equal(f.engine.canRedo(), true);
        f.engine["undoLayer" + modifier.name](id);
        assert.equal(f.engine.canRedo(), true);
        f.engine["redoLayer" + modifier.name](id);
        assert.equal(f.engine.canRedo(), true);
    });
}

test("empty transactions change no document or history", function (t) {
    const f = createFixture(t);
    const before = f.engine.getState();
    assert.equal(f.engine.beginTransaction(), true);
    assert.equal(f.engine.commitTransaction(), true);
    assert.equal(f.engine.beginTransaction(), true);
    assert.equal(f.engine.cancelTransaction(), true);
    assert.deepEqual(f.engine.getState(), before);
    assert.equal(f.events.length, 0);
    assert.equal(f.engine.commitTransaction(), false);
});

test("serialize/load preserves modifiers and local histories but omits runtime/view/global history", function (t) {
    const f = createFixture(t);
    const id = addTestLayer(f);
    f.engine.setSelection({type: "rectangle", x: 1, y: 2, width: 10, height: 12});
    for (const modifier of modifiers) {
        f.engine["createLayer" + modifier.name](id);
        f.engine["addLayer" + modifier.name + "Operation"](id, createOperation(modifier.type, 10));
        f.engine["addLayer" + modifier.name + "Operation"](id, createOperation(modifier.type, 20));
        f.engine["undoLayer" + modifier.name](id);
    }
    f.engine.setLayerAdjustment(id, "exposure", 0.25);
    f.engine.setLayerPerspective(id, {topLeft: {x: 0, y: 0}, topRight: {x: 32, y: 1}, bottomRight: {x: 30, y: 24}, bottomLeft: {x: 1, y: 23}});
    f.engine.setCrop({x: 3, y: 4, width: 100, height: 150});
    f.engine.setStraighten(-7);
    f.engine.setZoom(3);
    const serialized = f.engine.serialize();
    const data = JSON.parse(JSON.stringify(serialized));
    assert.deepEqual(data, serialized);
    assert.equal(data.layers[0].source, "asset:layer");
    for (const name of ["scale", "offsetX", "rotation", "canUndo", "canRedo", "undoStack", "proxy"]) assert.equal(name in data, false);
    assert.equal("sourceReference" in data.layers[0], false);
    for (const modifier of modifiers) {
        assert.equal(data.layers[0][modifier.key].operations.length, 2);
        assert.equal(data.layers[0][modifier.key][modifier.index], 1);
    }
    const other = createFixture(t);
    other.engine.setZoom(2);
    other.engine.setCanvasBackground("black");
    other.events.length = 0;
    assert.equal(other.engine.load(data), true);
    assert.equal(other.events.length, 1);
    assert.equal(other.engine.getState().scale, 2);
    assert.equal(other.engine.canUndo(), false);
    assert.equal(other.engine.canRedo(), false);
    assert.deepEqual(other.engine.serialize(), serialized);
    assert.equal(other.engine.getState().layers[0].source, "asset:layer");
    assert.equal(other.engine.getState().layers[0].sourceReference, "asset:layer");
    data.layers[0].paint.operations[0].points[0].x = 999;
    assert.deepEqual(other.engine.serialize(), serialized);
    const source = other.createCanvas();
    other.events.length = 0;
    assert.equal(other.engine.resolveLayerSource(id, source), true);
    assert.equal(other.events.length, 1);
    assert.equal(other.engine.getState().layers[0].source, source);
    assert.equal(other.engine.canUndo(), false);
    assert.deepEqual(other.engine.serialize(), serialized);
});

test("resolving a source also preserves the drawable through existing history snapshots", function (t) {
    const f = createFixture(t);
    const id = addTestLayer(f, {source: "asset:pending"});
    f.engine.setLayerOpacity(id, 0.5);
    const source = f.createCanvas();
    const before = f.events.length;
    assert.equal(f.engine.resolveLayerSource(id, source), true);
    assert.equal(f.events.length, before + 1);
    assert.equal(f.engine.resolveLayerSource(id, source), false);
    f.engine.undo();
    assert.equal(f.engine.getState().layers[0].source, source);
    assert.equal(f.engine.getState().layers[0].opacity, 1);
    f.engine.redo();
    assert.equal(f.engine.getState().layers[0].source, source);
    assert.equal(f.engine.getState().layers[0].sourceReference, "asset:pending");
});

test("serialize rejects sources without persistent references and returned data is independent", function (t) {
    const f = createFixture(t);
    const id = f.engine.addLayer({source: f.createCanvas()});
    assert.throws(function () { f.engine.serialize(); }, TypeError);
    f.engine.removeLayer(id);
    addTestLayer(f, {source: "asset:string"});
    const data = f.engine.serialize();
    data.layers[0].name = "Changed copy";
    assert.notEqual(f.engine.getState().layers[0].name, "Changed copy");
});

test("malformed loads fail atomically, including hidden redo operations", function (t) {
    const f = createFixture(t);
    const id = addTestLayer(f, {source: "asset:source"});
    f.engine.addLayerPaintOperation(id, createOperation("brush"));
    f.engine.undoLayerPaint(id);
    const before = f.engine.serialize();
    const state = f.engine.getState();
    const count = f.events.length;
    const badPoint = structuredClone(before);
    badPoint.layers[0].paint.operations[0].points[0].x = Infinity;
    const badIndex = structuredClone(before);
    badIndex.layers[0].paint.historyIndex = 2;
    for (const value of [{}, {...before, canvasWidth: -1}, {...before, layers: [before.layers[0], before.layers[0]]}, badPoint, badIndex]) {
        assert.throws(function () { f.engine.load(value); }, TypeError);
    }
    assert.deepEqual(f.engine.serialize(), before);
    assert.deepEqual(f.engine.getState(), state);
    assert.equal(f.events.length, count);
});

test("canvas changes, undo, redo and load reconcile fitted and manual views", function (t) {
    const f = createFixture(t, {panBounds: "contain"});
    f.engine.setCanvasSize(1800, 1400);
    assert.equal(f.engine.getState().scale, 0.5);
    f.engine.undo();
    assert.equal(f.engine.getState().scale, 0.875);
    f.engine.redo();
    assert.equal(f.engine.getState().scale, 0.5);
    f.engine.setZoom(2);
    f.engine.setPan(1000, 1000);
    f.engine.setCanvasSize(100, 100);
    assert.equal(f.engine.getState().scale, 2);
    assert.equal(f.engine.getState().offsetX, 0);
    assert.equal(f.engine.getState().offsetY, 0);
    f.engine.setFitMode("contain");
    const data = f.engine.serialize();
    data.canvasWidth = 900;
    data.canvasHeight = 700;
    f.engine.load(data);
    assert.equal(f.engine.getState().scale, 1);
});
