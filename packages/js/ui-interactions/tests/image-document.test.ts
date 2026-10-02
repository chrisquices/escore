import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture, addTestLayer, createOperation, modifiers, validatePoint} from './helpers/image.ts';

test("canvas dimensions, source resolution and viewport size remain independent", function (t) {
    const f = createFixture(t, {canvasWidth: 1080, canvasHeight: 1920});
    const source = f.createCanvas(72, 128);
    const id = addTestLayer(f, {source: source});
    f.engine.setLayerTransform(id, {x: 100, y: 200, scaleX: 0.5, scaleY: 0.5});
    const transform = f.engine.getState().layers[0].transform;

    assert.equal(f.engine.setCanvasSize(2160, 3840), true);
    const state = f.engine.getState();
    assert.equal(state.naturalWidth, 2880);
    assert.equal(state.naturalHeight, 5120);
    assert.equal(state.canvasWidth, 2160);
    assert.equal(state.canvasHeight, 3840);
    assert.equal(state.viewportWidth, 900);
    assert.equal(state.viewportHeight, 700);
    assert.deepEqual(state.layers[0].transform, transform);
    assert.equal(state.layers[0].source, source);
    assert.equal(source.width, 72);
    assert.equal(source.height, 128);
});

for (const method of ["addLayer", "resolveLayerSource"]) {
    test(method + " rejects video elements and video frames without changing document or history", function (t) {
        const f = createFixture(t);
        const id = addTestLayer(f, {source: "asset:pending"});
        f.engine.setLayerOpacity(id, 0.5);
        f.engine.undo();
        const before = f.engine.getState();
        const serialized = f.engine.serialize();
        f.events.length = 0;
        const sources = [
            {videoWidth: 0, videoHeight: 0, readyState: 0},
            {videoWidth: 32, videoHeight: 24, readyState: 1},
            {videoWidth: 32, videoHeight: 24, readyState: 4},
            {displayWidth: 32, displayHeight: 24, codedWidth: 32, codedHeight: 24},
            {displayWidth: 0, displayHeight: 0, codedWidth: 0, codedHeight: 0}
        ];

        for (const source of sources) {
            assert.throws(function () {
                if (method === "addLayer") f.engine.addLayer({source: source});
                else f.engine.resolveLayerSource(id, source);
            }, /video elements and video frames are not supported/);
            assert.deepEqual(f.engine.getState(), before);
            assert.deepEqual(f.engine.serialize(), serialized);
            assert.equal(f.engine.canRedo(), true);
            assert.equal(f.events.length, 0);
        }

        assert.equal(f.engine.redo(), true);
        assert.equal(f.engine.getState().layers[0].opacity, 0.5);
    });

    test(method + " rejects direct SVG image elements before changing document or history", function (t) {
        const f = createFixture(t);
        const id = addTestLayer(f, {source: "asset:pending"});
        f.engine.setLayerOpacity(id, 0.5);
        f.engine.undo();
        const before = f.engine.getState();
        const serialized = f.engine.serialize();
        f.events.length = 0;
        // DOM identity works across documents without relying on instanceof.
        const source = {
            namespaceURI: "http://www.w3.org/2000/svg",
            localName: "image",
            width: {baseVal: {value: 20}},
            height: {baseVal: {value: 10}}
        };
        assert.throws(function () {
            if (method === "addLayer") f.engine.addLayer({source: source});
            else f.engine.resolveLayerSource(id, source);
        }, /SVG <image>.*HTML <img>/);
        assert.deepEqual(f.engine.getState(), before);
        assert.deepEqual(f.engine.serialize(), serialized);
        assert.equal(f.engine.canRedo(), true);
        assert.equal(f.events.length, 0);
        assert.equal(f.engine.redo(), true);
        assert.equal(f.engine.getState().layers[0].opacity, 0.5);
    });
}

test("implicit canvas dimensions initialize once on a successful source load", function (t) {
    const f = createFixture(t, {canvasWidth: undefined, canvasHeight: undefined}, {image: {complete: false, naturalWidth: 0, naturalHeight: 0}});
    assert.equal(f.engine.getState().canvasWidth, 0);
    Object.assign(f.image, {complete: true, naturalWidth: 2880, naturalHeight: 5120});
    f.dispatch(f.image, "load");
    assert.equal(f.events.length, 1);
    assert.equal(f.events[0].canvasWidth, 2880);
    Object.assign(f.image, {naturalWidth: 4000, naturalHeight: 3000});
    f.dispatch(f.image, "load");
    assert.equal(f.engine.getState().naturalWidth, 4000);
    assert.equal(f.engine.getState().canvasWidth, 2880);
    assert.equal(f.engine.getState().canvasHeight, 5120);
});

test("document resize scales canvas geometry but preserves source-local modifiers", function (t) {
    const f = createFixture(t, {canvasWidth: 100, canvasHeight: 200});
    const id = addTestLayer(f);
    f.engine.setLayerTransform(id, {x: 10, y: 20, scaleX: 2, scaleY: 3, rotation: 25, flipX: true});
    f.engine.setSelection({type: "rectangle", x: 5, y: 6, width: 10, height: 12});
    f.engine.setCrop({x: 10, y: 20, width: 60, height: 80});
    for (const modifier of modifiers) {
        f.engine["createLayer" + modifier.name](id);
        f.engine["addLayer" + modifier.name + "Operation"](id, createOperation(modifier.type));
    }
    const before = f.engine.getState();
    const points = [{x: 0, y: 0}, {x: 32, y: 0}, {x: 32, y: 24}, {x: 0, y: 24}, {x: 12, y: 9}];
    const positions = points.map(function (point) { return f.engine.layerToCanvas(id, point.x, point.y); });
    f.events.length = 0;
    assert.equal(f.engine.resizeDocument(200, 600), true);
    const after = f.engine.getState();
    assert.equal(f.events.length, 1);
    points.forEach(function (point, index) {
        validatePoint(f.engine.layerToCanvas(id, point.x, point.y), {x: positions[index].x * 2, y: positions[index].y * 3});
    });
    assert.deepEqual(after.crop, {x: 20, y: 60, width: 120, height: 240});
    assert.deepEqual(after.selection, {type: "rectangle", x: 10, y: 18, width: 20, height: 36});
    for (const modifier of modifiers) assert.deepEqual(after.layers[0][modifier.key], before.layers[0][modifier.key]);
    assert.equal(after.layers[0].source, before.layers[0].source);
    f.engine.undo();
    assert.deepEqual(f.engine.getState().layers, before.layers);
    assert.deepEqual(f.engine.getState().selection, before.selection);
});

test("nonuniform document resize preserves rotated, flipped and perspective layer geometry", function (t) {
    const points = [{x: 0, y: 0}, {x: 32, y: 0}, {x: 32, y: 24}, {x: 0, y: 24}, {x: 12, y: 9}, {x: -3, y: 30}];
    const perspective = {topLeft: {x: 3, y: 2}, topRight: {x: 35, y: -1}, bottomRight: {x: 29, y: 26}, bottomLeft: {x: -2, y: 21}};

    for (const rotation of [0, 25, 90, 180, 270]) {
        for (const flips of [[false, false], [true, false], [false, true], [true, true]]) {
            for (const warp of [null, perspective]) {
                const f = createFixture(t);
                const id = addTestLayer(f);
                f.engine.setLayerTransform(id, {x: 100, y: 200, scaleX: 0.7, scaleY: 1.3, rotation: rotation, flipX: flips[0], flipY: flips[1], perspective: warp});
                const before = f.engine.serialize();
                const positions = points.map(function (point) { return f.engine.layerToCanvas(id, point.x, point.y); });
                f.events.length = 0;
                assert.equal(f.engine.resizeDocument(2000, 2400), true);
                assert.equal(f.events.length, 1);
                const after = f.engine.serialize();

                points.forEach(function (point, index) {
                    const expected = {x: positions[index].x * 2, y: positions[index].y * 3};
                    validatePoint(f.engine.layerToCanvas(id, point.x, point.y), expected);
                    validatePoint(f.engine.canvasToLayer(id, expected.x, expected.y), point);
                });
                assert.equal(f.engine.undo(), true);
                assert.deepEqual(f.engine.serialize(), before);
                assert.equal(f.engine.redo(), true);
                assert.deepEqual(f.engine.serialize(), after);
                assert.equal(f.engine.resizeDocument(1000, 800), true);
                points.forEach(function (point, index) {
                    validatePoint(f.engine.layerToCanvas(id, point.x, point.y), positions[index]);
                });
            }
        }
    }
});

test("rotated resize waits for unknown source dimensions without changing document or history", function (t) {
    const f = createFixture(t);
    addTestLayer(f);
    const id = addTestLayer(f, {source: "asset:unresolved"});
    f.engine.setLayerTransform(id, {rotation: 25});
    f.engine.setCanvasBackground("white");
    f.engine.undo();
    const before = f.engine.getState();
    f.events.length = 0;

    assert.equal(f.engine.resizeDocument(2000, 2400), false);
    assert.deepEqual(f.engine.getState(), before);
    assert.equal(f.events.length, 0);
    assert.equal(f.engine.resolveLayerSource(id, f.createCanvas()), true);
    const position = f.engine.layerToCanvas(id, 12, 9);
    assert.equal(f.engine.resizeDocument(2000, 2400), true);
    validatePoint(f.engine.layerToCanvas(id, 12, 9), {x: position.x * 2, y: position.y * 3});
    const source = f.engine.getState().layers[1].source;
    const saved = f.engine.serialize();
    assert.equal(f.engine.load(saved), true);
    assert.equal(f.engine.resolveLayerSource(id, source), true);
    validatePoint(f.engine.layerToCanvas(id, 12, 9), {x: position.x * 2, y: position.y * 3});
});

test("layer order, IDs, visibility, opacity and partial transforms remain editable", function (t) {
    const f = createFixture(t);
    const first = addTestLayer(f);
    const second = addTestLayer(f, {name: "Second"});
    assert.notEqual(first, second);
    assert.equal(f.engine.moveLayer(first, 1), true);
    assert.deepEqual(f.engine.getState().layers.map(function (layer) { return layer.id; }), [second, first]);
    f.engine.setLayerVisibility(first, false);
    f.engine.setLayerOpacity(first, 0.4);
    f.engine.setLayerTransform(first, {x: 12, y: 34, rotation: -15, flipY: true});
    f.engine.setLayerTransform(first, {scaleX: 2});
    const layer = f.engine.getState().layers[1];
    assert.equal(layer.visible, false);
    assert.equal(layer.opacity, 0.4);
    assert.deepEqual(layer.transform, {x: 12, y: 34, scaleX: 2, scaleY: 1, rotation: 345, flipX: false, flipY: true, perspective: null});
    assert.equal(f.engine.removeLayer(second), true);
    assert.equal(f.engine.removeLayer(second), false);
    assert.notEqual(addTestLayer(f), second);
});

test("layer resize changes only scales and can fit a bounding box", function (t) {
    const f = createFixture(t);
    const source = f.createCanvas(100, 200);
    const id = addTestLayer(f, {source: source, opacity: 0.3});
    f.engine.setLayerTransform(id, {x: 10, rotation: 45, flipX: true});
    const before = f.engine.getState().layers[0];
    assert.equal(f.engine.resizeLayer(id, 400, 300, true), true);
    assert.deepEqual(f.engine.getState().layers[0], {...before, transform: {...before.transform, scaleX: 1.5, scaleY: 1.5}});
    assert.equal(f.engine.resizeLayer(id, 400, 300), true);
    assert.equal(f.engine.getState().layers[0].transform.scaleX, 4);
    assert.equal(source.width, 100);
    assert.equal(source.height, 200);
});

test("selection, crop and straighten are safe document state without modifying view rotation", function (t) {
    const f = createFixture(t);
    f.engine.setRotation(90);
    const selection = {type: "lasso", points: [{x: -10, y: -20}, {x: 30, y: 0}, {x: 0, y: 40}]};
    const crop = {x: -5, y: 10, width: 60, height: 70};
    f.engine.setSelection(selection);
    f.engine.setCrop(crop);
    f.engine.setStraighten(-12);
    selection.points[0].x = 999;
    crop.width = 999;
    const state = f.engine.getState();
    assert.equal(state.selection.points[0].x, -10);
    assert.equal(state.crop.width, 60);
    assert.equal(state.straighten, -12);
    assert.equal(state.rotation, 90);
    assert.equal(state.canvasWidth, 1000);
    assert.equal(f.engine.clearSelection(), true);
    assert.equal(f.engine.clearSelection(), false);
    assert.equal(f.engine.clearCrop(), true);
    assert.equal(f.engine.clearCrop(), false);
    assert.equal(f.engine.resetStraighten(), true);
    assert.equal(f.engine.resetStraighten(), false);
});

test("adjustments keep one persistent value object and validate supported names", function (t) {
    const f = createFixture(t);
    const id = addTestLayer(f);
    assert.equal(f.engine.setLayerAdjustment(id, "exposure", 0.5), true);
    assert.equal(f.engine.createLayerAdjustments(id), false);
    for (const name of ["brightness", "contrast", "highlights", "shadows", "temperature", "tint", "saturation", "vibrance", "clarity", "sharpness"]) {
        f.engine.setLayerAdjustment(id, name, -0.2);
    }
    f.engine.setLayerAdjustmentsEnabled(id, false);
    assert.equal(f.engine.getState().layers[0].adjustments.values.exposure, 0.5);
    assert.throws(function () { f.engine.setLayerAdjustment(id, "unsupported", 1); }, TypeError);
    assert.throws(function () { f.engine.setLayerAdjustment(id, "exposure", Infinity); }, TypeError);
    assert.equal(f.engine.removeLayerAdjustments(id), true);
    assert.equal(f.engine.getState().layers[0].adjustments, null);
});

for (const modifier of modifiers) {
    test(modifier.name + " has persistent local undo/redo and discards only its redo branch", function (t) {
        const f = createFixture(t);
        const id = addTestLayer(f, {source: "asset:source"});
        f.engine["createLayer" + modifier.name](id);
        f.engine.load(f.engine.serialize());
        const before = f.engine.serialize();
        const input = createOperation(modifier.type, 10);
        assert.equal(f.engine["addLayer" + modifier.name + "Operation"](id, input), true);
        input.points[0].x = 999;
        f.engine["addLayer" + modifier.name + "Operation"](id, createOperation(modifier.type, 20));
        assert.equal(f.engine.canUndo(), false);
        assert.equal(f.engine["undoLayer" + modifier.name](id), true);
        let state = f.engine.getState().layers[0][modifier.key];
        assert.equal(state.operations.length, 1);
        assert.equal(state.operations[0].points[0].x, 10);
        assert.equal(state.canUndo, true);
        assert.equal(state.canRedo, true);
        f.engine["setLayer" + modifier.name + "Enabled"](id, false);
        f.engine["setLayer" + modifier.name + "Enabled"](id, true);
        assert.equal(f.engine["redoLayer" + modifier.name](id), true);
        assert.equal(f.engine.getState().layers[0][modifier.key].operations[1].points[0].x, 20);
        f.engine["undoLayer" + modifier.name](id);
        f.engine["addLayer" + modifier.name + "Operation"](id, createOperation(modifier.type, 30));
        state = f.engine.getState().layers[0][modifier.key];
        assert.deepEqual(state.operations.map(function (operation) { return operation.points[0].x; }), [10, 30]);
        assert.equal(state.canRedo, false);
        assert.equal(f.engine["redoLayer" + modifier.name](id), false);
        assert.deepEqual(before.layers[0][modifier.key].operations, []);
    });

    test(modifier.name + " captures selection locally and later transforms do not move its boundary", function (t) {
        const f = createFixture(t);
        const id = addTestLayer(f);
        f.engine.setLayerTransform(id, {x: 10, y: 20, scaleX: 2, scaleY: 2});
        f.engine.setSelection({type: "rectangle", x: 12, y: 24, width: 8, height: 12});
        f.engine["createLayer" + modifier.name](id);
        f.engine["addLayer" + modifier.name + "Operation"](id, createOperation(modifier.type));
        const captured = {type: "lasso", points: [{x: 1, y: 2}, {x: 5, y: 2}, {x: 5, y: 8}, {x: 1, y: 8}]};
        assert.deepEqual(f.engine.getState().layers[0][modifier.key].operations[0].selection, captured);
        f.engine["addLayer" + modifier.name + "Operation"](id, {...createOperation(modifier.type), selection: undefined});
        assert.deepEqual(f.engine.getState().layers[0][modifier.key].operations[1].selection, captured);
        f.engine.clearSelection();
        f.engine.setLayerTransform(id, {x: 100, rotation: 45, flipY: true});
        f.engine.resizeDocument(2000, 1600);
        assert.deepEqual(f.engine.getState().layers[0][modifier.key].operations[0].selection, captured);
        assert.equal(f.engine.getState().selection, null);
    });

    test(modifier.name + " honors and copies explicit layer-local selections including null", function (t) {
        const f = createFixture(t);
        const id = addTestLayer(f);
        f.engine.setLayerTransform(id, {x: 10, y: 20, scaleX: 2, scaleY: 3, rotation: 25, flipX: true});
        f.engine.setSelection({type: "rectangle", x: 100, y: 200, width: 20, height: 30});
        f.engine["createLayer" + modifier.name](id);
        const selections = [
            {type: "rectangle", x: 1, y: 2, width: 8, height: 6},
            {type: "lasso", points: [{x: 1, y: 2}, {x: 9, y: 2}, {x: 5, y: 8}]},
            null
        ];
        const expected = structuredClone(selections);

        for (const selection of selections) {
            assert.equal(f.engine["addLayer" + modifier.name + "Operation"](id, {...createOperation(modifier.type), selection: selection}), true);
            if (selection?.type === "rectangle") selection.x = 999;
            if (selection?.type === "lasso") selection.points[0].x = 999;
        }

        const operations = f.engine.getState().layers[0][modifier.key].operations;
        assert.deepEqual(operations.map(function (operation) { return operation.selection; }), expected);
        f.engine.clearSelection();
        f.engine.setLayerTransform(id, {rotation: 90, x: 300});
        assert.equal(f.engine["undoLayer" + modifier.name](id), true);
        assert.equal(f.engine["redoLayer" + modifier.name](id), true);
        assert.deepEqual(f.engine.getState().layers[0][modifier.key].operations, operations);
        const saved = f.engine.serialize();
        assert.equal(f.engine.load(saved), true);
        assert.deepEqual(f.engine.getState().layers[0][modifier.key].operations, operations);
    });

    test(modifier.name + " rejects malformed selections before changing modifiers or histories", function (t) {
        const f = createFixture(t);
        const id = addTestLayer(f);
        if (modifier.name === "Mask") f.engine.createLayerMask(id);
        const invalid = [false, [], {}, {type: "circle"},
            {type: "rectangle", x: Infinity, y: 0, width: 1, height: 1},
            {type: "rectangle", x: 0, y: 0, width: 0, height: 1},
            {type: "lasso", points: []}, {type: "lasso", points: [{x: NaN, y: 0}]}];

        for (const withHistory of [false, true]) {
            if (withHistory) {
                f.engine["addLayer" + modifier.name + "Operation"](id, createOperation(modifier.type));
                f.engine["addLayer" + modifier.name + "Operation"](id, createOperation(modifier.type, 20));
                f.engine["undoLayer" + modifier.name](id);
                f.engine.setCanvasBackground("white");
                f.engine.undo();
            }
            const before = f.engine.getState();
            const saved = f.engine.serialize();
            f.events.length = 0;
            for (const selection of invalid) {
                assert.throws(function () {
                    f.engine["addLayer" + modifier.name + "Operation"](id, {...createOperation(modifier.type), selection: selection});
                }, TypeError);
            }
            assert.deepEqual(f.engine.getState(), before);
            assert.deepEqual(f.engine.serialize(), saved);
            assert.equal(f.events.length, 0);
        }
    });

    test(modifier.name + " invalid strokes fail atomically", function (t) {
        const f = createFixture(t);
        const id = addTestLayer(f);
        f.engine["createLayer" + modifier.name](id);
        const before = f.engine.getState();
        const count = f.events.length;
        const invalid = [{type: "invalid"}, {points: []}, {points: [{x: Infinity, y: 0}]}, {size: 0}];
        if (modifier.name === "Liquify") invalid.push({strength: NaN}, {density: Infinity}, {rate: "1"});
        else invalid.push({hardness: -1}, {opacity: 2});
        if (modifier.name === "Paint") invalid.push({color: 3});
        if (modifier.name === "Retouch") invalid.push({sourceX: NaN}, {sourceY: Infinity});
        for (const value of invalid) {
            assert.throws(function () { f.engine["addLayer" + modifier.name + "Operation"](id, {...createOperation(modifier.type), ...value}); }, TypeError);
        }
        assert.deepEqual(f.engine.getState(), before);
        assert.equal(f.events.length, count);
    });
}

test("Paint accepts brush, pencil, fill and gradient as one operation each", function (t) {
    const f = createFixture(t);
    const id = addTestLayer(f);
    const operations = [createOperation("brush"), createOperation("pencil"), {type: "fill", x: 3, y: 4, color: "blue", opacity: 0.5, tolerance: 0.2}, {type: "gradient", startX: 0, startY: 0, endX: 20, endY: 10, startColor: "red", endColor: "blue", opacity: 0.5}];
    for (const operation of operations) assert.equal(f.engine.addLayerPaintOperation(id, operation), true);
    assert.deepEqual(f.engine.getState().layers[0].paint.operations.map(function (operation) { return operation.type; }), ["brush", "pencil", "fill", "gradient"]);
    assert.equal("hardness" in f.engine.getState().layers[0].paint.operations[1], false);
    for (let index = 0; index < operations.length; index++) assert.equal(f.engine.undoLayerPaint(id), true);
    assert.equal(f.engine.undoLayerPaint(id), false);
    assert.equal(f.engine.getState().layers[0].paint.operations.length, 0);
    assert.throws(function () { f.engine.addLayerPaintOperation(id, {...operations[2], tolerance: 2}); }, TypeError);
    assert.throws(function () { f.engine.addLayerPaintOperation(id, {...operations[3], endX: 0, endY: 0}); }, TypeError);
});

test("invalid document and layer mutations leave state and notifications unchanged", function (t) {
    const f = createFixture(t);
    const id = addTestLayer(f);
    const before = f.engine.getState();
    const count = f.events.length;
    for (const invoke of [
        function () { f.engine.setCanvasSize(0, 100); },
        function () { f.engine.resizeDocument(Infinity, 100); },
        function () { f.engine.setCanvasBackground(null); },
        function () { f.engine.setLayerTransform(id, {scaleX: 0}); },
        function () { f.engine.setLayerTransform(id, {unknown: 1}); },
        function () { f.engine.resizeLayer(id, 10, 10, "yes"); },
        function () { f.engine.setLayerPerspective(id, {}); },
        function () { f.engine.setLayerOpacity(id, 2); },
        function () { f.engine.setLayerVisibility(id, 1); },
        function () { f.engine.moveLayer(id, 1); },
        function () { f.engine.setSelection({type: "lasso", points: []}); },
        function () { f.engine.setCrop({x: 0, y: 0, width: -1, height: 10}); },
        function () { f.engine.setStraighten(NaN); }
    ]) assert.throws(invoke, TypeError);
    assert.deepEqual(f.engine.getState(), before);
    assert.equal(f.events.length, count);
    assert.equal(f.engine.removeLayer("missing"), false);
    assert.equal(f.engine.setLayerTransform("missing", {}), false);
    assert.equal(f.engine.rasterizeLayer("missing"), false);
});
