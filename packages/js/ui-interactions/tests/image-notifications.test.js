import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createImage} from '../src/image.js';
import {createFixture, addTestLayer, createOperation, modifiers, validateFrozen, validatePoint} from './helpers/image.js';

const changes = [
    ["canvas size", function (f) { f.engine.setCanvasSize(600, 400); }],
    ["document resize", function (f) { f.engine.resizeDocument(2000, 1600); }],
    ["background", function (f) { f.engine.setCanvasBackground("white"); }],
    ["add layer", function (f) { addTestLayer(f); }],
    ["resolve source", function (f) { f.engine.resolveLayerSource(f.id, f.createCanvas()); }],
    ["remove layer", function (f) { f.engine.removeLayer(f.id); }],
    ["rasterize", function (f) { f.engine.rasterizeLayer(f.id); }, function (f) { f.engine.resolveLayerSource(f.id, f.createCanvas()); }],
    ["visibility", function (f) { f.engine.setLayerVisibility(f.id, false); }],
    ["opacity", function (f) { f.engine.setLayerOpacity(f.id, 0.5); }],
    ["transform", function (f) { f.engine.setLayerTransform(f.id, {x: 10, y: 20, scaleX: 2, rotation: 30}); }],
    ["perspective", function (f) { f.engine.setLayerPerspective(f.id, {topLeft: {x: 0, y: 0}, topRight: {x: 32, y: 1}, bottomRight: {x: 30, y: 24}, bottomLeft: {x: 1, y: 23}}); }],
    ["clear perspective", function (f) { f.engine.clearLayerPerspective(f.id); }, function (f) { f.engine.setLayerPerspective(f.id, {topLeft: {x: 0, y: 0}, topRight: {x: 32, y: 1}, bottomRight: {x: 30, y: 24}, bottomLeft: {x: 1, y: 23}}); }],
    ["resize layer", function (f) { f.engine.resizeLayer(f.id, 100, 150); }, function (f) { f.engine.resolveLayerSource(f.id, f.createCanvas()); }],
    ["reorder", function (f) { f.engine.moveLayer(f.id, 1); }, function (f) { addTestLayer(f); }],
    ["selection", function (f) { f.engine.setSelection({type: "rectangle", x: 1, y: 2, width: 10, height: 20}); }],
    ["clear selection", function (f) { f.engine.clearSelection(); }, function (f) { f.engine.setSelection({type: "rectangle", x: 1, y: 2, width: 10, height: 20}); }],
    ["crop", function (f) { f.engine.setCrop({x: 1, y: 2, width: 30, height: 40}); }],
    ["clear crop", function (f) { f.engine.clearCrop(); }, function (f) { f.engine.setCrop({x: 1, y: 2, width: 30, height: 40}); }],
    ["straighten", function (f) { f.engine.setStraighten(15); }],
    ["reset straighten", function (f) { f.engine.resetStraighten(); }, function (f) { f.engine.setStraighten(15); }],
    ["adjustments", function (f) { f.engine.setLayerAdjustment(f.id, "exposure", 0.5); }],
    ["create adjustments", function (f) { f.engine.createLayerAdjustments(f.id); }],
    ["disable adjustments", function (f) { f.engine.setLayerAdjustmentsEnabled(f.id, false); }, function (f) { f.engine.createLayerAdjustments(f.id); }],
    ["remove adjustments", function (f) { f.engine.removeLayerAdjustments(f.id); }, function (f) { f.engine.createLayerAdjustments(f.id); }],
    ["load", function (f) { const data = f.engine.serialize(); data.layers[0].name = "Loaded"; f.engine.load(data); }],
    ["undo", function (f) { f.engine.undo(); }, function (f) { f.engine.setCanvasBackground("white"); }],
    ["redo", function (f) { f.engine.redo(); }, function (f) { f.engine.setCanvasBackground("white"); f.engine.undo(); }],
    ["cancel transaction", function (f) { f.engine.cancelTransaction(); }, function (f) { f.engine.beginTransaction(); f.engine.setCanvasBackground("white"); }]
];

for (const modifier of modifiers) {
    const create = function (f) { f.engine["createLayer" + modifier.name](f.id); };
    const add = function (f) { create(f); f.engine["addLayer" + modifier.name + "Operation"](f.id, createOperation(modifier.type)); };
    changes.push(
        ["create " + modifier.name, create],
        ["remove " + modifier.name, function (f) { f.engine["removeLayer" + modifier.name](f.id); }, create],
        ["disable " + modifier.name, function (f) { f.engine["setLayer" + modifier.name + "Enabled"](f.id, false); }, create],
        ["add " + modifier.name + " operation", function (f) { f.engine["addLayer" + modifier.name + "Operation"](f.id, createOperation(modifier.type)); }, modifier.name === "Mask" ? create : undefined],
        ["undo " + modifier.name, function (f) { f.engine["undoLayer" + modifier.name](f.id); }, add],
        ["redo " + modifier.name, function (f) { f.engine["redoLayer" + modifier.name](f.id); }, function (f) { add(f); f.engine["undoLayer" + modifier.name](f.id); }]
    );
}

for (const [name, change, setup] of changes) {
    test(name + " emits exactly once with fresh document data", function (t) {
        const f = createFixture(t);
        f.id = addTestLayer(f, {source: "asset:source"});
        if (setup) setup(f);
        const previous = f.events.at(-1);
        f.events.length = 0;
        change(f);
        assert.equal(f.events.length, 1);
        const state = f.events[0];
        assert.notEqual(state.layers, previous.layers);
        assert.deepEqual(state, f.engine.getState());
        validateFrozen(state.layers);
    });
}

test("public state remains a fresh mutable copy while notifications share frozen owned data", function (t) {
    const f = createFixture(t);
    const source = f.createCanvas();
    const id = addTestLayer(f, {source: source});
    f.engine.setSelection({type: "lasso", points: [{x: 0, y: 0}, {x: 20, y: 0}, {x: 10, y: 20}]});
    for (const modifier of modifiers) {
        f.engine["createLayer" + modifier.name](id);
        f.engine["addLayer" + modifier.name + "Operation"](id, createOperation(modifier.type));
    }
    const notification = f.events.at(-1);
    const a = f.engine.getState();
    const b = f.engine.getState();
    assert.deepEqual(a, b);
    assert.notEqual(a.layers, b.layers);
    assert.notEqual(a.layers, notification.layers);
    assert.equal(Object.isFrozen(a.layers), false);
    assert.equal(Object.isFrozen(source), false);
    for (const modifier of modifiers) {
        const operation = a.layers[0][modifier.key].operations[0];
        assert.notEqual(operation, b.layers[0][modifier.key].operations[0]);
        operation.points[0].x = 999;
        operation.selection.points[0].y = 999;
        const cached = notification.layers[0][modifier.key].operations[0];
        assert.equal(Reflect.set(cached.points[0], "x", 999), false);
        assert.equal(Reflect.set(cached.selection.points[0], "y", 999), false);
    }
    assert.deepEqual(f.engine.getState(), b);
    f.engine.setPan(10, 20);
    assert.equal(f.events.at(-1).layers, notification.layers);
    assert.equal(f.events.at(-1).selection, notification.selection);
});

test("no-op setters do not emit or replace cached document data", function (t) {
    const f = createFixture(t);
    const id = addTestLayer(f);
    for (const modifier of modifiers) f.engine["createLayer" + modifier.name](id);
    f.engine.createLayerAdjustments(id);
    const cached = f.events.at(-1).layers;
    f.events.length = 0;
    for (const [method, args] of [
        ["setCanvasSize", [1000, 800]], ["resizeDocument", [1000, 800]], ["setCanvasBackground", ["transparent"]],
        ["setStraighten", [0]], ["setLayerVisibility", [id, true]], ["setLayerOpacity", [id, 1]], ["setLayerTransform", [id, {}]],
        ["moveLayer", [id, 0]], ["setPan", [0, 0]], ["setZoom", [f.engine.getState().scale]], ["setRotation", [0]],
        ["setFlipHorizontal", [false]], ["setFlipVertical", [false]], ["setFitMode", ["contain"]], ["reset", []],
        ["setLayerAdjustment", [id, "exposure", 0]], ["clearCrop", []], ["clearSelection", []], ["removeLayer", ["missing"]]
    ]) f.engine[method](...args);
    for (const modifier of modifiers) {
        f.engine["createLayer" + modifier.name](id);
        f.engine["setLayer" + modifier.name + "Enabled"](id, true);
        f.engine["undoLayer" + modifier.name](id);
        f.engine["redoLayer" + modifier.name](id);
    }
    assert.equal(f.events.length, 0);
    f.engine.setPan(1, 2);
    assert.equal(f.events.at(-1).layers, cached);
});

test("rounded-away view changes do not notify, including the first change", function (t) {
    const f = createFixture(t);
    const before = f.engine.getState();
    f.engine.setPan(0.001, 0);
    assert.deepEqual(f.engine.getState(), before);
    assert.equal(f.events.length, 0);
    f.engine.setPan(0.06, 0);
    assert.equal(f.events.length, 1);
    assert.deepEqual(f.events[0], f.engine.getState());
});

for (const immediate of [false, true]) {
    test("returning to the last public view " + (immediate ? "with an immediate command" : "before the next frame") + " does not notify", function (t) {
        const f = createFixture(t);
        const before = f.engine.getState();
        f.dispatchPointer("pointerdown", 1, 100, 100);
        f.dispatchPointer("pointermove", 1, 125, 110);
        if (immediate) f.engine.setPan(0, 0);
        else f.dispatchPointer("pointermove", 1, 100, 100);
        f.dispatchPointer("pointerup", 1, 100, 100);
        assert.deepEqual(f.engine.getState(), before);
        f.flushFrames();
        assert.equal(f.events.length, 0);
        assert.equal(f.pending.size, 0);
        f.engine.setPan(10, 0);
        assert.equal(f.events.length, 1);
    });
}

test("a rounded-away reentrant change does not duplicate or starve subscriber deliveries", function (t) {
    const f = createFixture(t);
    const id = addTestLayer(f);
    const deliveries = [];
    f.engine.subscribe(function (state) {
        deliveries.push(["first", state.layers[0].opacity]);
        f.engine.setPan(0.001, 0);
    });
    f.engine.subscribe(function (state) { deliveries.push(["second", state.layers[0].opacity]); });
    f.events.length = 0;
    f.engine.setLayerOpacity(id, 0.5);
    assert.deepEqual(deliveries, [["first", 0.5], ["second", 0.5]]);
    assert.equal(f.events.length, 1);
});

test("subscriber mutation cannot change another subscriber's snapshot or deduplication baseline", function (t) {
    const f = createFixture(t);
    const seen = [];
    f.engine.subscribe(function (state) { state.offsetX = 999; });
    f.engine.subscribe(function (state) { seen.push(state.offsetX); });
    f.engine.setPan(1, 0);
    f.engine.setPan(1.001, 0);
    assert.deepEqual(seen, [1]);
    f.engine.setPan(2, 0);
    assert.deepEqual(seen, [1, 2]);
});

test("duplicate subscriptions retain one delivery and unsubscribe together", function (t) {
    const f = createFixture(t);
    const seen = [];
    const listener = function (state) { seen.push(state.offsetX); };
    const first = f.engine.subscribe(listener);
    const second = f.engine.subscribe(listener);
    f.engine.setPan(1, 0);
    assert.deepEqual(seen, [1]);
    first();
    f.engine.setPan(2, 0);
    assert.deepEqual(seen, [1]);
    second();
    const third = f.engine.subscribe(listener);
    f.engine.setPan(3, 0);
    assert.deepEqual(seen, [1, 3]);
    third();
});

test("history-only notifications update availability without rebuilding the document cache", function (t) {
    const f = createFixture(t);
    addTestLayer(f, {source: "asset:source"});
    const cached = f.events.at(-1).layers;
    f.engine.beginTransaction();
    assert.equal(f.events.at(-1).canUndo, false);
    assert.equal(f.events.at(-1).layers, cached);
    f.engine.commitTransaction();
    assert.equal(f.events.at(-1).canUndo, true);
    assert.equal(f.events.at(-1).layers, cached);
    f.engine.load(f.engine.serialize());
    assert.equal(f.events.at(-1).canUndo, false);
    assert.equal(f.events.at(-1).layers, cached);
});

for (const modifier of modifiers) {
    test(modifier.name + " loaded inactive operations become visible correctly on local redo", function (t) {
        const f = createFixture(t);
        const id = addTestLayer(f, {source: "asset:source"});
        f.engine["createLayer" + modifier.name](id);
        f.engine["addLayer" + modifier.name + "Operation"](id, createOperation(modifier.type));
        f.engine["undoLayer" + modifier.name](id);
        f.engine.load(f.engine.serialize());
        const data = f.engine.serialize();
        data.layers[0][modifier.key].operations[0].points[0].x = 123;
        f.events.length = 0;
        f.engine.load(data);
        assert.equal(f.events.length, 0, "inactive payload replacement does not change the notification snapshot");
        f.engine["redoLayer" + modifier.name](id);
        assert.equal(f.events.length, 1);
        assert.equal(f.events[0].layers[0][modifier.key].operations[0].points[0].x, 123);
        assert.deepEqual(f.events[0], f.engine.getState());
    });
}

test("free dragging uses an explicitly sized document before the host image loads or after it fails", function (t) {
    const f = createFixture(t, {canvasWidth: 100, canvasHeight: 80, panBounds: "free"}, {
        image: {complete: false, naturalWidth: 0, naturalHeight: 0}
    });
    addTestLayer(f);
    const document = f.engine.serialize();

    for (const failed of [false, true]) {
        if (failed) f.dispatch(f.image, "error");
        f.engine.setPan(0, 0);
        f.events.length = 0;
        assert.equal(f.engine.getState().loaded, false);
        assert.equal(f.engine.getState().canPan, true);
        f.dispatchPointer("pointerdown", 1, 100, 100);
        const move = f.dispatchPointer("pointermove", 1, 135, 80);
        assert.equal(move.defaultPrevented, true);
        assert.equal(f.engine.getState().offsetX, 35);
        assert.equal(f.engine.getState().offsetY, -20);
        assert.equal(f.events.length, 0);
        assert.equal(f.pending.size, 1);
        f.flushFrames();
        assert.equal(f.events.length, 1);
        assert.deepEqual(f.events[0], f.engine.getState());
        f.dispatchPointer("pointerup", 1, 135, 80);
        assert.deepEqual(f.engine.serialize(), document);
    }

});

test("free panning availability does not override disabled dragging", function (t) {
    const f = createFixture(t, {panBounds: "free", dragPan: false}, {
        image: {complete: false, naturalWidth: 0, naturalHeight: 0}
    });
    assert.equal(f.engine.getState().canPan, true);
    f.dispatchPointer("pointerdown", 1, 100, 100);
    assert.equal(f.dispatchPointer("pointermove", 1, 200, 200).defaultPrevented, false);
    f.dispatchPointer("pointerup", 1, 200, 200);
    assert.equal(f.engine.getState().offsetX, 0);
    assert.equal(f.engine.getState().offsetY, 0);
    assert.equal(f.pending.size, 0);
    assert.equal(f.events.length, 0);
});

test("native image dragging is suppressed only while drag panning is available", function (t) {
    for (const dragPan of [true, false]) {
        const f = createFixture(t, {dragPan: dragPan, panBounds: "contain"});
        f.dispatchPointer("pointerdown", 1, 100, 100);
        assert.equal(f.dispatch(f.image, "dragstart").defaultPrevented, false);
        f.dispatchPointer("pointerup", 1, 100, 100);
        f.engine.setZoom(2);
        const before = f.engine.getState();
        f.dispatchPointer("pointerdown", 1, 100, 100);
        assert.equal(f.dispatch(f.image, "dragstart").defaultPrevented, dragPan);
        f.dispatchPointer("pointermove", 1, 150, 125);
        assert.equal(f.engine.getState().offsetX, before.offsetX + (dragPan ? 50 : 0));
        assert.equal(f.engine.getState().offsetY, before.offsetY + (dragPan ? 25 : 0));
        f.dispatchPointer("pointerup", 1, 150, 125);
        f.engine.destroy();
        assert.equal(f.dispatch(f.image, "dragstart").defaultPrevented, false);
    }
});

test("pointer gestures leave interactive descendants alone and still pan ordinary content", function (t) {
    const f = createFixture(t);
    const captures = [];
    f.viewport.setPointerCapture = function (id) { captures.push(id); };
    const paths = [
        [{tagName: "BUTTON"}], [{tagName: "SPAN"}, {tagName: "BUTTON"}],
        [{tagName: "path"}, {tagName: "svg"}, {tagName: "A"}],
        [{tagName: "INPUT"}], [{tagName: "SELECT"}], [{tagName: "TEXTAREA"}],
        [{tagName: "SPAN"}, {tagName: "LABEL"}], [{tagName: "SUMMARY"}],
        [{tagName: "SPAN"}, {tagName: "DIV", isContentEditable: true}]
    ];
    const before = f.engine.getState();
    for (const path of paths) {
        for (let press = 0; press < 2; press++) {
            f.dispatch(f.viewport, "pointerdown", {
                pointerId: 1, clientX: 100, clientY: 100, pointerType: "mouse", button: 0,
                composedPath: function () { return [...path, f.viewport, f.document]; }
            });
            f.dispatchPointer("pointermove", 1, 130, 120);
            f.dispatchPointer("pointerup", 1, 130, 120);
        }
    }
    assert.deepEqual(captures, []);
    assert.deepEqual(f.engine.getState(), before);
    assert.equal(f.events.length, 0);
    assert.equal(f.pending.size, 0);

    f.dispatch(f.viewport, "pointerdown", {
        pointerId: 2, clientX: 100, clientY: 100, pointerType: "mouse", button: 0,
        composedPath: function () { return [{tagName: "SPAN"}, {tagName: "DIV"}, f.viewport, {tagName: "FORM"}]; }
    });
    f.dispatchPointer("pointermove", 2, 130, 120);
    assert.deepEqual(captures, [2]);
    assert.equal(f.engine.getState().offsetX, 30);
    assert.equal(f.engine.getState().offsetY, 20);
});

test("disabled gestures and already handled presses do not capture pointers", function (t) {
    for (const disabled of [true, false]) {
        const f = createFixture(t, {dragPan: !disabled, pinchZoom: !disabled, doubleClickZoom: !disabled});
        const captures = [];
        f.viewport.setPointerCapture = function (id) { captures.push(id); };
        const before = f.engine.getState();
        for (let press = 0; press < 2; press++) {
            const event = new Event("pointerdown", {cancelable: true});
            Object.assign(event, {pointerId: 1, clientX: 100, clientY: 100, pointerType: "mouse", button: 0});
            if (!disabled) event.preventDefault();
            f.viewport.dispatchEvent(event);
            f.dispatchPointer("pointermove", 1, 130, 120);
            f.dispatchPointer("pointerup", 1, 130, 120);
        }
        assert.deepEqual(captures, []);
        assert.deepEqual(f.engine.getState(), before);
        assert.equal(f.pending.size, 0);
    }
});

test("keyboard shortcuts preserve typing in controls across composed event paths", function (t) {
    const f = createFixture(t);
    const before = f.engine.getState();
    for (const control of [
        {tagName: "INPUT"}, {tagName: "TEXTAREA"}, {tagName: "SELECT"}, {tagName: "BUTTON"},
        {tagName: "DIV", isContentEditable: true}
    ]) {
        for (const key of ["r", "R", "+", "=", "-", "0", "f"]) {
            const event = f.dispatch(f.viewport, "keydown", {
                key: key,
                composedPath: function () { return [control, {}, {tagName: "IMAGE-FIELD"}, f.viewport]; }
            });
            assert.equal(event.defaultPrevented, false, "editing must retain the " + key + " key");
            assert.deepEqual(f.engine.getState(), before);
        }
    }
    f.viewport.isContentEditable = true;
    assert.equal(f.dispatch(f.viewport, "keydown", {key: "r"}).defaultPrevented, false);
    assert.deepEqual(f.engine.getState(), before);
    f.viewport.isContentEditable = false;
    assert.equal(f.dispatch(f.viewport, "keydown", {key: "r"}).defaultPrevented, true);
    assert.equal(f.engine.getState().rotation, 90, "viewer keyboard shortcuts remain available");
});

test("losing pointer capture ends dragging without releasing another element's capture", function (t) {
    const f = createFixture(t);
    let releases = 0;
    f.viewport.releasePointerCapture = function () { releases++; };
    f.dispatchPointer("pointerdown", 1, 100, 100);
    f.dispatchPointer("pointermove", 1, 125, 130);
    f.flushFrames();
    const before = f.engine.getState();
    const count = f.events.length;
    f.dispatchPointer("lostpointercapture", 1, 125, 130);
    assert.equal(releases, 0);
    f.dispatch(f.viewport, "pointermove", {pointerId: 1, clientX: 300, clientY: 350, pointerType: "mouse", buttons: 0});
    assert.deepEqual(f.engine.getState(), before);
    assert.equal(f.pending.size, 0);
    assert.equal(f.events.length, count);
    f.dispatchPointer("pointerdown", 1, 300, 350);
    f.dispatchPointer("pointermove", 1, 310, 370);
    assert.equal(f.engine.getState().offsetX, before.offsetX + 10);
    assert.equal(f.engine.getState().offsetY, before.offsetY + 20);
});

test("capture loss cancels taps but the normal capture loss after release preserves double taps", function (t) {
    const f = createFixture(t);
    t.mock.method(Date, "now", function () { return 1000; });
    f.viewport.releasePointerCapture = function (id) { f.dispatchPointer("lostpointercapture", id, 100, 100); };
    const scale = f.engine.getState().scale;
    f.dispatchPointer("pointerdown", 1, 100, 100);
    f.dispatchPointer("pointerup", 1, 100, 100);
    f.dispatchPointer("lostpointercapture", 1, 100, 100);
    f.dispatchPointer("pointerdown", 1, 100, 100);
    f.dispatchPointer("lostpointercapture", 1, 100, 100);
    f.dispatchPointer("pointerup", 1, 100, 100);
    assert.equal(f.engine.getState().scale, scale);

    for (let tap = 0; tap < 2; tap++) {
        f.dispatchPointer("pointerdown", 1, 100, 100);
        f.dispatchPointer("pointerup", 1, 100, 100);
        f.dispatchPointer("lostpointercapture", 1, 100, 100);
        assert.equal(f.engine.getState().scale, tap === 0 ? scale : 1);
    }
});

test("initialization recognizes an already failed image and retry can recover", function (t) {
    const errors = [];
    const changes = [];
    const f = createFixture(t, {
        onError: function (error) { errors.push(error); },
        onChange: function (state) { changes.push(state); }
    }, {image: {complete: true, naturalWidth: 0, naturalHeight: 0}});
    const failed = f.engine.getState();
    assert.equal(failed.loading, false);
    assert.equal(failed.loaded, false);
    assert.equal(failed.error, "The image could not be loaded.");
    assert.equal(errors.length, 0, "initialization does not replay a past error occurrence");
    assert.equal(changes.length, 1);
    assert.deepEqual(changes[0], failed);
    assert.equal(f.engine.retry(), true);
    assert.equal(f.engine.getState().loading, true);
    assert.equal(f.engine.getState().error, null);
    Object.assign(f.image, {complete: true, naturalWidth: 100, naturalHeight: 80});
    f.dispatch(f.image, "load");
    assert.equal(f.engine.getState().loaded, true);
    assert.equal(f.engine.getState().loading, false);
    assert.equal(f.engine.getState().error, null);
    assert.equal(errors.length, 0);
});

test("initialization does not mistake an empty or pending image for a failed image", function (t) {
    for (const image of [
        {complete: true, src: "", currentSrc: "", naturalWidth: 0, naturalHeight: 0},
        {complete: false, src: "asset:pending", naturalWidth: 0, naturalHeight: 0}
    ]) {
        const errors = [];
        const f = createFixture(t, {onError: function (error) { errors.push(error); }}, {image: image});
        assert.equal(f.engine.getState().error, null);
        assert.equal(f.engine.getState().loading, Boolean(image.src));
        assert.equal(errors.length, 0);
    }
});

test("a newly configured source waits for its own result after an earlier image failure", function (t) {
    const errors = [];
    const f = createFixture(t, {src: "asset:new", onError: function (error) { errors.push(error); }}, {
        image: {complete: true, naturalWidth: 0, naturalHeight: 0}
    });
    assert.equal(f.engine.getState().src, "asset:new");
    assert.equal(f.engine.getState().loading, true);
    assert.equal(f.engine.getState().error, null);
    assert.equal(errors.length, 0);
    f.dispatch(f.image, "error");
    assert.equal(f.engine.getState().loading, false);
    assert.equal(f.engine.getState().error, "The image could not be loaded.");
    assert.equal(errors.length, 1);
});

test("free dragging stays unavailable until a document has dimensions", function (t) {
    const f = createFixture(t, {canvasWidth: undefined, canvasHeight: undefined, panBounds: "free"}, {
        image: {complete: false, naturalWidth: 0, naturalHeight: 0}
    });
    assert.equal(f.engine.getState().canPan, false);
    f.dispatchPointer("pointerdown", 1, 100, 100);
    assert.equal(f.dispatchPointer("pointermove", 1, 135, 80).defaultPrevented, false);
    f.dispatchPointer("pointerup", 1, 135, 80);
    assert.equal(f.engine.getState().offsetX, 0);
    assert.equal(f.engine.getState().offsetY, 0);
    assert.equal(f.pending.size, 0);
    assert.equal(f.events.length, 0);

    f.engine.setCanvasSize(100, 80);
    assert.equal(f.events.at(-1).canPan, true);
    assert.equal(f.engine.getState().loaded, false);
    f.dispatchPointer("pointerdown", 1, 100, 100);
    assert.equal(f.dispatchPointer("pointermove", 1, 135, 80).defaultPrevented, true);
    f.dispatchPointer("pointerup", 1, 135, 80);
    f.flushFrames();
    assert.equal(f.events.at(-1).offsetX, 35);
    assert.equal(f.events.at(-1).offsetY, -20);
});

for (const [name, endings] of [
    ["before a tap", ["pointercancel"]],
    ["after a tap", ["pointerup", "pointercancel"]],
    ["repeatedly", ["pointercancel", "pointercancel"]]
]) {
    test("pointer cancellation " + name + " clears double-tap state and releases the pointer", function (t) {
        const f = createFixture(t);
        t.mock.method(Date, "now", function () { return 1000; });
        const captured = new Set();
        const released = [];
        f.viewport.setPointerCapture = function (id) { captured.add(id); };
        f.viewport.releasePointerCapture = function (id) { captured.delete(id); released.push(id); };
        const before = f.engine.getState();
        let id = 0;

        for (const ending of endings) {
            id++;
            f.dispatchPointer("pointerdown", id, 100, 100);
            assert.equal(captured.has(id), true);
            f.dispatchPointer(ending, id, 100, 100);
            assert.equal(captured.size, 0);
            assert.equal(released.at(-1), id);
            f.dispatchPointer("pointermove", id, 200, 250);
            assert.deepEqual(f.engine.getState(), before);
            assert.equal(f.events.length, 0);
            assert.equal(f.pending.size, 0);
        }

        f.dispatchPointer("pointerdown", ++id, 100, 100);
        f.dispatchPointer("pointerup", id, 100, 100);
        assert.deepEqual(f.engine.getState(), before, "one new tap must not join an interrupted sequence");
        f.dispatchPointer("pointerdown", ++id, 100, 100);
        f.dispatchPointer("pointerup", id, 100, 100);
        assert.equal(f.engine.getState().scale, 1, "two new taps still zoom to actual size");
        assert.equal(f.events.length, 1);

        for (let tap = 0; tap < 2; tap++) {
            f.dispatchPointer("pointerdown", ++id, 100, 100);
            f.dispatchPointer("pointerup", id, 100, 100);
        }
        assert.equal(f.engine.getState().scale, before.scale, "the next double tap still returns to fit");
        assert.equal(f.events.length, 2);
        assert.equal(captured.size, 0);
        assert.equal(released.length, id);
    });
}

test("cancelling one pointer clears pending taps without turning the surviving release into a tap", function (t) {
    const f = createFixture(t);
    t.mock.method(Date, "now", function () { return 1000; });
    const before = f.engine.getState();
    f.dispatchPointer("pointerdown", 1, 100, 100);
    f.dispatchPointer("pointerup", 1, 100, 100);
    f.dispatchPointer("pointerdown", 2, 100, 100);
    f.dispatchPointer("pointerdown", 3, 120, 100);
    f.dispatchPointer("pointercancel", 2, 100, 100);
    f.dispatchPointer("pointermove", 2, 200, 250);
    f.dispatchPointer("pointerup", 3, 120, 100);
    assert.deepEqual(f.engine.getState(), before);
    assert.equal(f.pending.size, 0);

    f.dispatchPointer("pointerdown", 4, 100, 100);
    f.dispatchPointer("pointerup", 4, 100, 100);
    assert.deepEqual(f.engine.getState(), before);
    assert.equal(f.events.length, 0);
    f.dispatchPointer("pointerdown", 5, 100, 100);
    f.dispatchPointer("pointerup", 5, 100, 100);
    assert.equal(f.engine.getState().scale, 1);
    assert.equal(f.events.length, 1);
});

for (const gesture of ["drag", "pinch", "two-finger press", "control press"]) {
    test(gesture + " interrupts double-tap detection without disabling the next double tap", function (t) {
        const f = createFixture(t);
        let now = 1000;
        t.mock.method(Date, "now", function () { return now; });
        f.dispatchPointer("pointerdown", 1, 100, 100);
        f.dispatchPointer("pointerup", 1, 100, 100);
        now += 50;
        if (gesture === "control press") {
            f.dispatch(f.viewport, "pointerdown", {
                pointerId: 2, clientX: 100, clientY: 100, pointerType: "touch", button: 0,
                composedPath: function () { return [{tagName: "BUTTON"}, f.viewport]; }
            });
        } else {
            f.dispatchPointer("pointerdown", 2, 100, 100);
        }
        if (gesture === "pinch" || gesture === "two-finger press") f.dispatchPointer("pointerdown", 3, 200, 100);
        now += 30;
        if (gesture === "drag") f.dispatchPointer("pointermove", 2, 120, 100);
        if (gesture === "pinch") f.dispatchPointer("pointermove", 3, 220, 100);
        now += 30;
        if (gesture === "pinch" || gesture === "two-finger press") f.dispatchPointer("pointerup", 3, 220, 100);
        f.dispatchPointer("pointerup", 2, 120, 100);
        const before = f.engine.getState();
        now += 50;
        f.dispatchPointer("pointerdown", 4, 100, 100);
        f.dispatchPointer("pointerup", 4, 100, 100);
        assert.deepEqual(f.engine.getState(), before, "one tap after a different gesture must not zoom");
        now += 50;
        f.dispatchPointer("pointerdown", 5, 100, 100);
        f.dispatchPointer("pointerup", 5, 100, 100);
        assert.equal(f.engine.getState().scale, 1, "a fresh pair of consecutive taps still zooms");
    });
}

test("pan, wheel and pinch coalesce to one latest-state delivery per frame", function (t) {
    const f = createFixture(t);
    addTestLayer(f);
    f.engine.setZoom(2);
    const cached = f.events.at(-1).layers;
    f.events.length = 0;
    f.dispatchPointer("pointerdown", 1, 100, 100);
    for (let index = 1; index <= 30; index++) f.dispatchPointer("pointermove", 1, 100 + index, 100 + index);
    assert.equal(f.events.length, 0);
    assert.equal(f.pending.size, 1);
    f.flushFrames();
    assert.equal(f.events.length, 1);
    assert.equal(f.events[0].offsetX, 30);
    assert.equal(f.events[0].layers, cached);
    f.dispatchPointer("pointerup", 1, 130, 130);
    for (let index = 0; index < 8; index++) f.dispatch(f.viewport, "wheel", {deltaY: -100, clientX: 300, clientY: 250});
    assert.equal(f.events.length, 1);
    assert.equal(f.pending.size, 1);
    f.flushFrames();
    assert.equal(f.events.length, 2);
    assert.deepEqual(f.events.at(-1), f.engine.getState());
    f.dispatchPointer("pointerdown", 1, 100, 100);
    f.dispatchPointer("pointerdown", 2, 300, 100);
    for (let index = 1; index <= 20; index++) f.dispatchPointer("pointermove", 2, 300 - index, 100);
    assert.equal(f.pending.size, 1);
    f.flushFrames();
    assert.equal(f.events.length, 3);
    assert.equal(f.events.at(-1).layers, cached);
    assert.deepEqual(f.events.at(-1), f.engine.getState());
});

test("explicit view commands emit immediately and cancel pending gesture delivery", function (t) {
    const f = createFixture(t);
    f.dispatch(f.viewport, "wheel", {deltaY: -100, clientX: 300, clientY: 250});
    assert.equal(f.pending.size, 1);
    assert.equal(f.events.length, 0);
    f.engine.setPan(15, 20);
    assert.equal(f.events.length, 1);
    assert.equal(f.pending.size, 0);
    assert.equal(f.cancelled.length, 1);
    f.flushFrames();
    assert.equal(f.events.length, 1);
    for (const [method, args] of [["setZoom", [2]], ["zoomIn", []], ["zoomOut", []], ["zoomToPoint", [3, 200, 300]]]) {
        const count = f.events.length;
        assert.equal(f.engine[method](...args), true);
        assert.equal(f.events.length, count + 1);
        assert.equal(f.pending.size, 0);
    }
});

test("an image document without a window initializes and cleans up safely", function (t) {
    const document = new EventTarget();
    document.defaultView = null;
    const viewport = new EventTarget();
    viewport.getBoundingClientRect = function () { return {left: 0, top: 0, width: 100, height: 80}; };
    const image = new EventTarget();
    Object.assign(image, {
        ownerDocument: document,
        parentElement: viewport,
        getBoundingClientRect: viewport.getBoundingClientRect,
        complete: true,
        naturalWidth: 100,
        naturalHeight: 80,
        src: "asset:image"
    });
    const events = [];
    const engine = createImage(image, {panBounds: "free", onChange: function (state) { events.push(state); }});
    t.after(function () { engine.destroy(); });
    events.length = 0;
    assert.equal(engine.getState().loaded, true);
    assert.equal(engine.setPan(3, -4), true);
    assert.equal(events.length, 1);
    assert.equal(events[0].offsetX, 3);
    assert.equal(events[0].offsetY, -4);
    engine.destroy();
    image.dispatchEvent(new Event("load"));
    assert.equal(events.length, 1);
});

test("gesture notifications fall back to immediate delivery without animation frames", function (t) {
    const f = createFixture(t, {}, {frames: false});
    f.dispatch(f.viewport, "wheel", {deltaY: -100, clientX: 300, clientY: 250});
    assert.equal(f.events.length, 1);
    f.dispatchPointer("pointerdown", 1, 100, 100);
    f.dispatchPointer("pointermove", 1, 120, 130);
    assert.equal(f.events.length, 2);
});

for (const panBounds of ["contain", "free"]) {
    test("viewport resize reapplies manual zoom limits with " + panBounds + " panning", function (t) {
        const f = createFixture(t, {minZoom: "fit", maxZoom: 2, panBounds: panBounds});
        addTestLayer(f);
        f.engine.setZoom(1);
        f.engine.setPan(50, -25);
        const document = f.engine.serialize();
        const canUndo = f.engine.canUndo();
        f.events.length = 0;

        for (const [width, height, expectedScale, expectedMin, expectedMax] of [
            [1800, 1400, 1.75, 1.75, 2],
            [1200, 900, 1.75, 1.125, 2],
            [4000, 3200, 4, 4, 4],
            [900, 700, 2, 0.875, 2],
            [600, 400, 2, 0.5, 2]
        ]) {
            const count = f.events.length;
            f.rect.width = width;
            f.rect.height = height;
            f.notifyResize();
            const state = f.engine.getState();
            assert.equal(state.scale, expectedScale);
            assert.equal(state.minScale, expectedMin);
            assert.equal(state.maxScale, expectedMax);
            assert.equal(state.offsetX + 0, panBounds === "free" ? 50 : 0);
            assert.equal(state.offsetY + 0, panBounds === "free" ? -25 : 0);
            assert.equal(f.events.length, count + 1);
            assert.deepEqual(f.events.at(-1), state);
            f.notifyResize();
            assert.equal(f.events.length, count + 1, "repeated resize observations do not notify");
            assert.deepEqual(f.engine.serialize(), document);
            assert.equal(f.engine.canUndo(), canUndo);
        }
    });
}

test("viewport resize preserves valid manual zoom with a fixed minimum", function (t) {
    const f = createFixture(t, {minZoom: 0.5, maxZoom: 2, panBounds: "free"});
    f.engine.setZoom(1);
    f.engine.setPan(50, -25);
    f.events.length = 0;

    for (const [width, height] of [[1800, 1400], [450, 350]]) {
        f.rect.width = width;
        f.rect.height = height;
        f.notifyResize();
        const state = f.events.at(-1);
        assert.equal(state.scale, 1);
        assert.equal(state.minScale, 0.5);
        assert.equal(state.offsetX, 50);
        assert.equal(state.offsetY, -25);
    }

    assert.equal(f.events.length, 2);
});

test("viewport resize keeps an automatically fitted view fitted", function (t) {
    const f = createFixture(t, {minZoom: "fit"});

    for (const [width, height, expectedScale] of [[1800, 1400, 1.75], [450, 350, 0.4375]]) {
        f.rect.width = width;
        f.rect.height = height;
        f.notifyResize();
        const state = f.events.at(-1);
        assert.equal(state.scale, expectedScale);
        assert.equal(state.isFitted, true);
        assert.equal(state.offsetX, 0);
        assert.equal(state.offsetY, 0);
    }

    assert.equal(f.events.length, 2);
});

test("fullscreen, resize and load event echoes do not cause duplicate notifications", async function (t) {
    const f = createFixture(t);
    addTestLayer(f);
    const cached = f.events.at(-1).layers;
    f.events.length = 0;
    await f.engine.enterFullscreen();
    assert.equal(f.events.length, 1);
    await f.engine.exitFullscreen();
    assert.equal(f.events.length, 2);
    f.notifyResize();
    assert.equal(f.events.length, 2);
    f.rect.width = 800;
    f.notifyResize();
    assert.equal(f.events.length, 3);
    f.notifyResize();
    f.dispatch(f.image, "load");
    assert.equal(f.events.length, 3);
    f.dispatch(f.image, "error");
    const count = f.events.length;
    f.dispatch(f.image, "error");
    assert.equal(f.events.length, count);
    f.engine.retry();
    f.dispatch(f.image, "load");
    const loaded = f.events.length;
    f.dispatch(f.image, "load");
    assert.equal(f.events.length, loaded);
    for (const state of f.events) assert.equal(state.layers, cached);
});

test("fullscreen state, exit and toggle use the viewport shadow root", async function (t) {
    const f = createFixture(t);
    const host = new EventTarget();
    const root = {fullscreenElement: null};
    f.viewport.getRootNode = function () { return root; };
    let requests = 0;
    let exits = 0;
    f.viewport.requestFullscreen = async function () {
        requests++;
        root.fullscreenElement = f.viewport;
        f.document.fullscreenElement = host;
        f.dispatch(f.document, "fullscreenchange");
    };
    f.document.exitFullscreen = async function () {
        exits++;
        root.fullscreenElement = null;
        f.document.fullscreenElement = null;
        f.dispatch(f.document, "fullscreenchange");
    };

    assert.equal(await f.engine.enterFullscreen(), true);
    assert.equal(f.engine.getState().isFullscreen, true);
    assert.deepEqual(f.events.map(function (state) { return state.isFullscreen; }), [true]);
    assert.equal(await f.engine.enterFullscreen(), true);
    assert.equal(requests, 1);
    assert.equal(await f.engine.exitFullscreen(), true);
    assert.equal(exits, 1);
    assert.equal(root.fullscreenElement, null);
    assert.equal(f.engine.getState().isFullscreen, false);

    f.engine.toggleFullscreen();
    await Promise.resolve();
    assert.equal(requests, 2);
    assert.equal(f.engine.getState().isFullscreen, true);
    f.engine.toggleFullscreen();
    await Promise.resolve();
    assert.equal(exits, 2);
    assert.equal(f.engine.getState().isFullscreen, false);

    // Browser-initiated transitions also update state without an engine method call.
    await f.viewport.requestFullscreen();
    await f.document.exitFullscreen();
    assert.deepEqual(f.events.map(function (state) { return state.isFullscreen; }), [true, false, true, false, true, false]);

    root.fullscreenElement = new EventTarget();
    f.document.fullscreenElement = host;
    f.dispatch(f.document, "fullscreenchange");
    assert.equal(f.engine.getState().isFullscreen, false);
    assert.equal(await f.engine.exitFullscreen(), true);
    assert.equal(exits, 3, "another element's fullscreen session is left alone");
    assert.equal(f.events.length, 6);
});

test("document fullscreen detection retains the WebKit fallback", async function (t) {
    const f = createFixture(t);
    f.viewport.getRootNode = function () { return f.document; };
    f.document.fullscreenElement = null;
    f.viewport.requestFullscreen = undefined;
    f.document.exitFullscreen = undefined;
    f.viewport.webkitRequestFullscreen = async function () {
        f.document.webkitFullscreenElement = f.viewport;
        f.dispatch(f.document, "webkitfullscreenchange");
    };
    f.document.webkitExitFullscreen = async function () {
        f.document.webkitFullscreenElement = null;
        f.dispatch(f.document, "webkitfullscreenchange");
    };

    assert.equal(await f.engine.enterFullscreen(), true);
    assert.equal(f.engine.getState().isFullscreen, true);
    assert.equal(await f.engine.exitFullscreen(), true);
    assert.equal(f.engine.getState().isFullscreen, false);
    assert.deepEqual(f.events.map(function (state) { return state.isFullscreen; }), [true, false]);
});

test("subscriber failures are isolated and reentrant edits stop stale deliveries", function (t) {
    const f = createFixture(t);
    const id = addTestLayer(f);
    const errors = [];
    const deliveries = [];
    t.mock.method(console, "error", function (...args) { errors.push(args); });
    const unsubscribe = f.engine.subscribe(function () { throw new Error("consumer failure"); });
    f.engine.subscribe(function (state) {
        deliveries.push(["first", state.layers[0].opacity]);
        if (state.layers[0].opacity === 0.5) f.engine.setLayerOpacity(id, 0.25);
    });
    f.engine.subscribe(function (state) { deliveries.push(["second", state.layers[0].opacity]); });
    assert.equal(deliveries.length, 0, "subscribe does not emit immediately");
    f.engine.setLayerOpacity(id, 0.5);
    assert.equal(errors.length, 2);
    assert.deepEqual(deliveries, [["first", 0.5], ["first", 0.25], ["second", 0.25]]);
    unsubscribe();
    unsubscribe();
    f.engine.setLayerOpacity(id, 0.75);
    assert.equal(errors.length, 2);
});

test("destroying the engine during an error notification stops later callbacks", function (t) {
    const calls = [];
    const f = createFixture(t, {onError: function () { calls.push("error"); }});
    f.engine.subscribe(function (state) {
        if (!state.error) return;
        calls.push("change");
        f.engine.destroy();
    });
    f.engine.subscribe(function () { calls.push("later subscriber"); });
    f.dispatch(f.image, "error");
    assert.deepEqual(calls, ["change"]);
    f.dispatch(f.image, "error");
    f.flushFrames();
    assert.deepEqual(calls, ["change"]);
});

test("retrying during an error notification preserves the reported error message", function (t) {
    const errors = [];
    const f = createFixture(t, {onError: function (error) { errors.push(error); }});
    f.engine.subscribe(function (state) {
        if (state.error) f.engine.retry();
    });
    f.dispatch(f.image, "error");
    assert.equal(f.engine.getState().error, null);
    assert.equal(f.engine.getState().loading, true);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].id, "image-load-failed");
    assert.equal(errors[0].message, "The image could not be loaded.");
});

test("destroy cancels frames, detaches events and leaves read snapshots safe", async function (t) {
    const f = createFixture(t);
    const id = addTestLayer(f);
    f.engine.addLayerPaintOperation(id, createOperation("brush"));
    f.dispatch(f.viewport, "wheel", {deltaY: -100, clientX: 300, clientY: 250});
    assert.equal(f.pending.size, 1);
    const count = f.events.length;
    f.engine.destroy();
    f.engine.destroy();
    assert.equal(f.pending.size, 0);
    f.flushFrames();
    f.dispatch(f.image, "load");
    f.dispatch(f.image, "error");
    f.dispatch(f.document, "fullscreenchange");
    f.dispatch(f.viewport, "wheel", {deltaY: -100, clientX: 300, clientY: 250});
    f.rect.width = 500;
    f.notifyResize();
    assert.equal(f.events.length, count);
    assert.equal(f.engine.setCanvasSize(20, 20), false);
    assert.equal(f.engine.setPan(1, 2), false);
    assert.equal(f.engine.addLayerPaintOperation(id, createOperation("brush")), false);
    assert.equal(f.engine.undo(), false);
    assert.equal(f.engine.redo(), false);
    assert.equal(f.engine.beginTransaction(), false);
    assert.equal(f.engine.render(f.createCanvas()), false);
    assert.equal(f.engine.renderPreview(f.createCanvas(), 20, 20), false);
    assert.equal(f.engine.pickColor(1, 2), false);
    assert.equal(f.engine.getState().layers[0].paint.canUndo, false);
    const unsubscribe = f.engine.subscribe(function () { assert.fail("destroyed subscriber called"); });
    unsubscribe();
    const state = f.engine.getState();
    state.layers[0].paint.operations[0].points[0].x = 999;
    assert.notEqual(f.engine.getState().layers[0].paint.operations[0].points[0].x, 999);
    await assert.rejects(f.engine.exportImage(), /destroyed/);
});

for (const method of ["setCanvasSize", "resizeDocument", "load"]) {
    test("manual zoom stays within limits after " + method, function (t) {
        for (const panBounds of ["free", "contain"]) {
            const f = createFixture(t, {minZoom: "fit", maxZoom: 2, panBounds: panBounds});
            f.engine.setZoom(1);
            f.engine.setPan(25, -30);
            for (const [width, height, expected] of [[100, 80, 8.75], [1000, 800, 2]]) {
                if (method === "load") {
                    f.engine.load({...f.engine.serialize(), canvasWidth: width, canvasHeight: height});
                } else {
                    f.engine[method](width, height);
                }
                const state = f.engine.getState();
                assert.equal(state.scale, expected);
                assert.ok(state.scale >= state.minScale && state.scale <= state.maxScale);
                if (panBounds === "free") assert.deepEqual([state.offsetX, state.offsetY], [25, -30]);
                assert.deepEqual(f.events.at(-1), state);
            }
        }
    });
}

test("rotation and history restoration reapply manual zoom limits", function (t) {
    const f = createFixture(t, {minZoom: "fit", maxZoom: 2});
    f.engine.setRotation(90);
    f.engine.setZoom(0.8);
    f.engine.setRotation(0);
    assert.equal(f.engine.getState().scale, 0.875);
    f.engine.setCanvasSize(100, 80);
    assert.equal(f.engine.getState().scale, 8.75);
    f.engine.undo();
    assert.equal(f.engine.getState().scale, 2);
    f.engine.redo();
    assert.equal(f.engine.getState().scale, 8.75);
    f.engine.beginTransaction();
    f.engine.resizeDocument(1000, 800);
    assert.equal(f.engine.getState().scale, 2);
    f.engine.cancelTransaction();
    assert.equal(f.engine.getState().scale, 8.75);
    assert.equal(f.engine.zoomOut(), false, "zooming out at the minimum must not zoom in");
});

test("pinch keeps both fingers on their content while the midpoint moves", function (t) {
    for (const panBounds of ["free", "contain"]) {
        const f = createFixture(t, {panBounds: panBounds});
        f.engine.setZoom(2);
        const first = f.engine.viewportToCanvas(400, 350);
        const second = f.engine.viewportToCanvas(500, 350);
        f.events.length = 0;
        f.dispatchPointer("pointerdown", 1, 410, 370);
        f.dispatchPointer("pointerdown", 2, 510, 370);
        f.dispatchPointer("pointermove", 2, 610, 370);
        validatePoint(f.engine.canvasToViewport(first.x, first.y), {x: 400, y: 350});
        validatePoint(f.engine.canvasToViewport(second.x, second.y), {x: 600, y: 350});
        f.dispatchPointer("pointermove", 1, 510, 370);
        validatePoint(f.engine.canvasToViewport(first.x, first.y), {x: 500, y: 350});
        validatePoint(f.engine.canvasToViewport(second.x, second.y), {x: 600, y: 350});
        assert.equal(f.engine.getState().scale, 2);
        assert.equal(f.events.length, 0);
        assert.equal(f.pending.size, 1);
        f.flushFrames();
        assert.equal(f.events.length, 1);
        assert.deepEqual(f.events[0], f.engine.getState());
    }
});

test("a pinch at the zoom limit still follows its midpoint and respects pan bounds", function (t) {
    const f = createFixture(t, {maxZoom: 2, panBounds: "contain"});
    f.engine.setZoom(2);
    f.dispatchPointer("pointerdown", 1, 410, 370);
    f.dispatchPointer("pointerdown", 2, 510, 370);
    f.dispatchPointer("pointermove", 2, 610, 370);
    assert.equal(f.engine.getState().scale, 2);
    assert.equal(f.engine.getState().offsetX, 50);
    f.engine.setPan(550, 0);
    f.dispatchPointer("pointermove", 2, 710, 370);
    assert.equal(f.engine.getState().offsetX, 550);
    const disabled = createFixture(t, {pinchZoom: false});
    const before = disabled.engine.getState();
    disabled.dispatchPointer("pointerdown", 1, 410, 370);
    disabled.dispatchPointer("pointerdown", 2, 510, 370);
    disabled.dispatchPointer("pointermove", 2, 610, 370);
    assert.deepEqual(disabled.engine.getState(), before);
    assert.equal(disabled.pending.size, 0);
});

for (const ending of ["pointerup", "pointercancel", "lostpointercapture"]) {
    test("three pointers returning to two reset the pinch distance after " + ending, function (t) {
        const f = createFixture(t);
        f.dispatchPointer("pointerdown", 1, 100, 100);
        f.dispatchPointer("pointerdown", 2, 200, 100);
        f.dispatchPointer("pointerdown", 3, 500, 100);
        f.dispatchPointer(ending, 1, 100, 100);
        const before = f.engine.getState().scale;
        f.dispatchPointer("pointermove", 2, 201, 100);
        assert.ok(Math.abs(f.engine.getState().scale - before * 299 / 300) < 0.0001);
        f.dispatchPointer("pointermove", 1, 800, 100);
        assert.ok(Math.abs(f.engine.getState().scale - before * 299 / 300) < 0.0001);
    });
}

test("late image loads and retries preserve an explicitly sized manual view", function (t) {
    for (const navigation of ["zoom", "pan", "drag"]) {
        const f = createFixture(t, {}, {image: {complete: false, naturalWidth: 0, naturalHeight: 0}});
        if (navigation === "zoom") f.engine.setZoom(2);
        if (navigation === "drag") {
            f.dispatchPointer("pointerdown", 1, 100, 100);
            f.dispatchPointer("pointermove", 1, 125, 70);
            f.dispatchPointer("pointerup", 1, 125, 70);
            f.flushFrames();
        } else {
            f.engine.setPan(25, -30);
        }
        const before = f.engine.getState();
        const document = f.engine.serialize();
        Object.assign(f.image, {complete: true, naturalWidth: 2880, naturalHeight: 5120});
        for (let attempt = 0; attempt < 2; attempt++) {
            f.dispatch(f.image, "load");
            const state = f.engine.getState();
            assert.equal(state.loaded, true);
            assert.deepEqual([state.scale, state.offsetX, state.offsetY], [before.scale, 25, -30]);
            assert.deepEqual(f.engine.serialize(), document);
            const count = f.events.length;
            f.dispatch(f.image, "load");
            assert.equal(f.events.length, count);
            if (attempt === 0) f.engine.retry();
        }
    }
});

test("first implicit image dimensions still initialize the fitted view", function (t) {
    const f = createFixture(t, {canvasWidth: undefined, canvasHeight: undefined}, {image: {complete: false, naturalWidth: 0, naturalHeight: 0}});
    f.engine.setZoom(2);
    f.engine.setPan(25, -30);
    Object.assign(f.image, {complete: true, naturalWidth: 1000, naturalHeight: 800});
    f.dispatch(f.image, "load");
    const state = f.engine.getState();
    assert.deepEqual([state.canvasWidth, state.canvasHeight, state.scale, state.offsetX, state.offsetY], [1000, 800, 0.875, 0, 0]);
});

test("clamped no-op panning keeps automatic fitting active", function (t) {
    const f = createFixture(t, {panBounds: "contain"});
    f.engine.setPan(25, -30);
    f.dispatchPointer("pointerdown", 1, 100, 100);
    f.dispatchPointer("pointermove", 1, 125, 70);
    f.dispatchPointer("pointerup", 1, 125, 70);
    assert.equal(f.events.length, 0);
    f.rect.width = 1800;
    f.rect.height = 1400;
    f.notifyResize();
    assert.equal(f.engine.getState().scale, 1.75);
    assert.equal(f.engine.getState().isFitted, true);
});

test("horizontal-only wheel events leave navigation and page scrolling alone", function (t) {
    const f = createFixture(t);
    const before = f.engine.getState();
    for (const deltaX of [25, -25, 0]) {
        const event = f.dispatch(f.viewport, "wheel", {deltaX: deltaX, deltaY: 0, clientX: 460, clientY: 370});
        assert.equal(event.defaultPrevented, false);
        assert.deepEqual(f.engine.getState(), before);
    }
    assert.equal(f.pending.size, 0);
    assert.equal(f.events.length, 0);
    const event = f.dispatch(f.viewport, "wheel", {deltaX: 0, deltaY: -25, clientX: 460, clientY: 370});
    assert.equal(event.defaultPrevented, true);
    assert.ok(f.engine.getState().scale > before.scale);
});

test("rounded-away viewport resize is silent without losing pending gesture changes", function (t) {
    const f = createFixture(t);
    addTestLayer(f);
    const before = f.engine.getState();
    f.events.length = 0;
    f.rect.width = 900.001;
    f.notifyResize();
    assert.deepEqual(f.engine.getState(), before);
    assert.equal(f.events.length, 0);
    f.dispatch(f.viewport, "wheel", {deltaY: -25, clientX: 460, clientY: 370});
    assert.equal(f.pending.size, 1);
    f.rect.width = 900.002;
    f.notifyResize();
    assert.equal(f.events.length, 1);
    assert.equal(f.pending.size, 0);
    assert.deepEqual(f.events[0], f.engine.getState());
    f.flushFrames();
    f.notifyResize();
    assert.equal(f.events.length, 1);
    f.rect.width = 900.1;
    f.notifyResize();
    assert.equal(f.events.length, 2);
    assert.equal(f.events[1].viewportWidth, 900.1);
});
