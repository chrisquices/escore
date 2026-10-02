import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import {createFixture, addTestLayer, createOperation, createPattern, getPixels, validatePixels} from './helpers/image.ts';

const {loadImage} = createRequire(import.meta.url)("@napi-rs/canvas");

function createRenderFixture(t, width = 96, height = 80) {
    return createFixture(t, {canvasWidth: width, canvasHeight: height});
}

function getRendered(f, target = f.createCanvas()) {
    assert.equal(f.engine.render(target), true);
    return target;
}

const stages = {
    adjustments(f, id) {
        for (const name of ["exposure", "brightness", "contrast", "highlights", "shadows", "temperature", "tint", "saturation", "vibrance", "clarity", "sharpness"]) f.engine.setLayerAdjustment(id, name, 0.2);
    },
    liquify(f, id) {
        for (const type of ["push", "twirl", "bloat", "shrink", "restore"]) f.engine.addLayerLiquifyOperation(id, {...createOperation(type), size: 40});
    },
    retouch(f, id) {
        f.engine.addLayerRetouchOperation(id, createOperation("clone"));
        f.engine.addLayerRetouchOperation(id, createOperation("heal", 20));
    },
    paint(f, id) {
        f.engine.addLayerPaintOperation(id, createOperation("brush"));
        f.engine.addLayerPaintOperation(id, createOperation("pencil", 20));
        f.engine.addLayerPaintOperation(id, {type: "fill", x: 0, y: 0, color: "blue", opacity: 0.4, tolerance: 0.2});
        f.engine.addLayerPaintOperation(id, {type: "gradient", startX: 0, startY: 0, endX: 70, endY: 50, startColor: "rgba(255,0,0,0.2)", endColor: "rgba(0,0,255,0.8)", opacity: 0.5});
    },
    mask(f, id) {
        f.engine.createLayerMask(id);
        f.engine.addLayerMaskOperation(id, createOperation("erase"));
        f.engine.addLayerMaskOperation(id, createOperation("restore", 20));
    },
    perspective(f, id) {
        f.engine.setLayerPerspective(id, {topLeft: {x: 4, y: 3}, topRight: {x: 86, y: 0}, bottomRight: {x: 90, y: 73}, bottomLeft: {x: 1, y: 76}});
    }
};

test("render composites ordered visible layers, opacity and background into a reset target", function (t) {
    const f = createRenderFixture(t, 8, 8);
    const red = f.createCanvas(8, 8);
    red.getContext("2d").fillStyle = "red";
    red.getContext("2d").fillRect(0, 0, 8, 8);
    const blue = f.createCanvas(8, 8);
    blue.getContext("2d").fillStyle = "blue";
    blue.getContext("2d").fillRect(0, 0, 8, 8);
    const bottom = addTestLayer(f, {source: red});
    const top = addTestLayer(f, {source: blue, opacity: 0.5});
    const target = f.createCanvas();
    const context = target.getContext("2d");
    context.globalAlpha = 0.1;
    context.globalCompositeOperation = "destination-out";
    context.translate(500, 500);
    context.beginPath();
    context.rect(0, 0, 1, 1);
    context.clip();
    getRendered(f, target);
    assert.equal(target.width, 8);
    assert.equal(target.height, 8);
    validatePixels(getPixels(target).slice(0, 4), [127, 0, 128, 255], 1);
    f.engine.moveLayer(bottom, 1);
    assert.deepEqual(Array.from(getPixels(getRendered(f, target)).slice(0, 4)), [255, 0, 0, 255]);
    f.engine.setLayerVisibility(bottom, false);
    f.engine.setLayerVisibility(top, false);
    assert.ok(getPixels(getRendered(f, target)).every(function (value) { return value === 0; }));
    f.engine.setCanvasBackground("white");
    assert.deepEqual(Array.from(getPixels(getRendered(f, target)).slice(0, 4)), [255, 255, 255, 255]);
});

test("resized rotated layers render at their scaled positions without reading source pixels", function (t) {
    for (const rotation of [25, 90]) {
        const f = createRenderFixture(t, 200, 160);
        const source = f.createCanvas(40, 32);
        const context = source.getContext("2d");
        const samples = [
            {x: 10, y: 8, color: "red", pixel: [255, 0, 0, 255]},
            {x: 30, y: 8, color: "blue", pixel: [0, 0, 255, 255]},
            {x: 10, y: 24, color: "lime", pixel: [0, 255, 0, 255]},
            {x: 30, y: 24, color: "white", pixel: [255, 255, 255, 255]}
        ];
        for (const sample of samples) {
            context.fillStyle = sample.color;
            context.fillRect(sample.x - 10, sample.y - 8, 20, 16);
        }
        const id = addTestLayer(f, {source: source});
        f.engine.setLayerTransform(id, {x: 100, y: 80, scaleX: 0.8, scaleY: 0.9, rotation: rotation, flipX: true});
        const positions = samples.map(function (sample) { return f.engine.layerToCanvas(id, sample.x, sample.y); });
        assert.equal(f.engine.resizeDocument(400, 480), true);
        const target = f.createCanvas();
        const readPixels = t.mock.method(Object.getPrototypeOf(context), "getImageData", function () {
            throw new Error("Source pixel reads are unavailable.");
        });
        const rendered = f.engine.render(target);
        readPixels.mock.restore();
        assert.equal(rendered, true, "an affine resize must retain the native drawImage rendering path");
        samples.forEach(function (sample, index) {
            const position = positions[index];
            validatePixels(target.getContext("2d").getImageData(Math.floor(position.x * 2), Math.floor(position.y * 3), 1, 1).data, sample.pixel);
        });
    }
});

for (const name of Object.keys(stages)) {
    test(name + " rendering is repeatable, preserves sources, and survives a preview render", function (t) {
        const f = createRenderFixture(t);
        const source = createPattern(f);
        const id = addTestLayer(f, {source: source});
        stages[name](f, id);
        const before = getPixels(source);
        const state = f.engine.getState();
        const count = f.events.length;
        const target = getRendered(f);
        const expected = getPixels(target);
        assert.notDeepEqual(expected, before, "the enabled stage must affect the pixels");
        validatePixels(getPixels(getRendered(f, target)), expected);
        assert.equal(f.engine.renderPreview(f.createCanvas(), 30, 25), true);
        validatePixels(getPixels(getRendered(f, target)), expected);
        validatePixels(getPixels(source), before);
        assert.deepEqual(f.engine.getState(), state);
        assert.equal(f.events.length, count);
    });
}

test("the combined modifier pipeline survives rasterize, persistence and undo/redo", async function (t) {
    const f = createRenderFixture(t);
    const source = createPattern(f);
    const id = addTestLayer(f, {source: source, opacity: 0.7});
    for (const name of ["adjustments", "liquify", "retouch", "paint", "mask"]) stages[name](f, id);
    f.engine.setLayerTransform(id, {x: 4, y: 3, scaleX: 0.8, scaleY: 0.9, rotation: 12});
    const before = f.engine.serialize();
    const expected = getPixels(getRendered(f));
    const original = getPixels(source);
    f.events.length = 0;
    assert.equal(f.engine.rasterizeLayer(id), true);
    assert.equal(f.events.length, 1);
    const baked = f.engine.getState().layers[0];
    for (const name of ["adjustments", "liquify", "retouch", "paint", "mask"]) assert.equal(baked[name], null);
    assert.match(baked.sourceReference, /^data:image\/png;base64,.+/);
    assert.notEqual(baked.source, source);
    assert.deepEqual(baked.transform, before.layers[0].transform);
    validatePixels(getPixels(getRendered(f)), expected);
    const saved = JSON.parse(JSON.stringify(f.engine.serialize()));
    assert.equal(saved.layers[0].source, baked.sourceReference);
    f.engine.undo();
    assert.deepEqual(f.engine.serialize(), before);
    validatePixels(getPixels(getRendered(f)), expected);
    f.engine.redo();
    assert.deepEqual(f.engine.serialize(), saved);
    validatePixels(getPixels(getRendered(f)), expected);
    validatePixels(getPixels(source), original);

    const restored = createRenderFixture(t);
    assert.equal(restored.engine.load(saved), true);
    const decoded = await loadImage(saved.layers[0].source);
    const decodedCanvas = restored.createCanvas(decoded.naturalWidth, decoded.naturalHeight);
    decodedCanvas.getContext("2d").drawImage(decoded, 0, 0);
    validatePixels(getPixels(decodedCanvas), getPixels(baked.source));
    // The native test renderer samples transformed Image and Canvas sources differently at their edges.
    assert.equal(restored.engine.resolveLayerSource(id, decodedCanvas), true);
    assert.deepEqual(restored.engine.serialize(), saved);
    validatePixels(getPixels(getRendered(restored)), expected);
});

test("failed rasterization encoding preserves the document, modifiers and redo history", function (t) {
    for (const failure of ["throw", "data:,", "data:image/png;base64,"]) {
        const f = createRenderFixture(t);
        const source = createPattern(f);
        const id = addTestLayer(f, {source: source});
        f.engine.addLayerPaintOperation(id, createOperation("brush"));
        f.engine.setCanvasBackground("white");
        f.engine.undo();
        const before = f.engine.getState();
        const saved = f.engine.serialize();
        const expected = getPixels(getRendered(f));
        f.events.length = 0;
        const encode = t.mock.method(Object.getPrototypeOf(source), "toDataURL", function (type) {
            assert.equal(type, "image/png");
            if (failure === "throw") throw new Error("PNG encoding failed.");
            return failure;
        });

        assert.equal(f.engine.rasterizeLayer(id), false);
        encode.mock.restore();
        assert.deepEqual(f.engine.getState(), before);
        assert.deepEqual(f.engine.serialize(), saved);
        assert.equal(f.events.length, 0);
        validatePixels(getPixels(getRendered(f)), expected);
        assert.equal(f.engine.redo(), true);
        assert.equal(f.engine.getState().canvasBackground, "white");
    }
});

test("scratch canvases reset across multiple layers, different dimensions and failed renders", function (t) {
    const f = createRenderFixture(t);
    for (const size of [32, 96, 48]) {
        const id = addTestLayer(f, {source: createPattern(f, size, size), opacity: 0.6});
        for (const name of Object.keys(stages)) stages[name](f, id);
    }
    const expected = getPixels(getRendered(f));
    const target = f.createCanvas();
    validatePixels(getPixels(getRendered(f, target)), expected);
    const id = f.engine.getState().layers[2].id;
    f.engine.addLayerPaintOperation(id, {type: "gradient", startX: 0, startY: 0, endX: 20, endY: 20, startColor: "invalid-color", endColor: "blue", opacity: 1});
    assert.equal(f.engine.render(target), false);
    f.engine.undoLayerPaint(id);
    validatePixels(getPixels(getRendered(f, target)), expected);
});

test("renderPreview keeps output aspect ratio, honors crop and never upscales", function (t) {
    const f = createRenderFixture(t, 500, 400);
    const source = createPattern(f, 1000, 800, false);
    const id = addTestLayer(f, {source: source});
    f.engine.setLayerTransform(id, {scaleX: 0.5, scaleY: 0.5});
    const before = f.engine.serialize();
    const count = f.events.length;
    const target = f.createCanvas();
    assert.equal(f.engine.renderPreview(target, 200, 200), true);
    assert.equal(target.width, 200);
    assert.equal(target.height, 160);
    const canvasCount = f.canvases.length;
    assert.equal(f.engine.renderPreview(target, 100, 100), true);
    assert.equal(target.width, 100);
    assert.equal(target.height, 80);
    assert.equal(f.canvases.length, canvasCount, "smaller previews reuse the proxy");
    assert.equal(f.engine.renderPreview(target, 240, 240), true);
    assert.equal(target.width, 240);
    assert.equal(target.height, 192);
    assert.equal(f.canvases.length, canvasCount + 1, "larger previews regenerate the proxy");
    assert.equal(f.engine.renderPreview(target, 1000, 1000), true);
    assert.equal(target.width, 500);
    assert.equal(target.height, 400);
    assert.deepEqual(f.engine.serialize(), before);
    assert.equal(f.events.length, count);
    assert.equal(source.width, 1000);
    f.engine.setCrop({x: 10, y: 20, width: 300, height: 200});
    f.engine.renderPreview(target, 150, 150);
    assert.equal(target.width, 150);
    assert.equal(target.height, 100);
    f.engine.render(target);
    assert.equal(target.width, 300);
    assert.equal(target.height, 200);
});

test("preview proxies are always regenerated from the original source", function (t) {
    const f = createRenderFixture(t, 500, 400);
    const source = createPattern(f, 1000, 800);
    const id = addTestLayer(f, {source: source});
    f.engine.setLayerTransform(id, {scaleX: 0.5, scaleY: 0.5});
    const target = f.createCanvas();
    f.engine.renderPreview(target, 100, 100);
    f.engine.renderPreview(target, 240, 240);
    const expected = f.createCanvas(240, 192);
    expected.getContext("2d").drawImage(source, 0, 0, 240, 192);
    validatePixels(getPixels(target), getPixels(expected));
    const full = getPixels(getRendered(f));
    f.engine.rasterizeLayer(id);
    validatePixels(getPixels(getRendered(f)), full);
});

for (const [name, width, height] of [["wide", 10000, 100], ["tall", 100, 10000]]) {
    test(name + " previews retain both axes at extreme aspect ratios and one-pixel bounds", function (t) {
        const f = createRenderFixture(t, width, height);
        const source = f.createCanvas(width, height);
        source.getContext("2d").fillStyle = "red";
        source.getContext("2d").fillRect(0, 0, width, height);
        addTestLayer(f, {source: source});
        const target = f.createCanvas();
        const state = f.engine.getState();
        const count = f.events.length;

        for (const bound of [64, 1, 63.9, 1.9]) {
            assert.equal(f.engine.renderPreview(target, bound, bound), true);
            const longAxis = Math.floor(bound);
            assert.deepEqual([target.width, target.height], width > height ? [longAxis, 1] : [1, longAxis]);
            const pixels = getPixels(target);
            validatePixels(pixels.slice(0, 4), [255, 0, 0, 255]);
            validatePixels(pixels.slice(-4), [255, 0, 0, 255]);
        }

        assert.deepEqual(f.engine.getState(), state);
        assert.equal(f.events.length, count);
        assert.deepEqual([source.width, source.height], [width, height]);
    });

    test(name + " cropped and straightened previews keep their composition canvas non-empty", function (t) {
        const f = createRenderFixture(t, width, height);
        f.engine.setCanvasBackground("red");
        f.engine.setCrop({x: 10, y: 10, width: width - 20, height: height - 20});
        f.engine.setStraighten(180);
        const state = f.engine.getState();
        const count = f.events.length;
        const target = f.createCanvas();
        const canvasCount = f.canvases.length;

        assert.equal(f.engine.renderPreview(target, 64, 64), true);
        const dimensions = width > height ? [64, 1] : [1, 64];
        assert.deepEqual([target.width, target.height], dimensions);
        assert.equal(f.canvases.length, canvasCount + 1);
        const composition = f.canvases.at(-1);
        assert.deepEqual([composition.width, composition.height], dimensions);
        assert.ok(getPixels(target).some(function (value, index) { return index % 4 === 3 && value > 0; }));
        assert.deepEqual(f.engine.getState(), state);
        assert.equal(f.events.length, count);
    });
}

test("preview rounding uses the limiting pixel and the closest representable aspect ratio", function (t) {
    for (const [width, height, expectedWidth, expectedHeight] of [[22, 17, 15, 12], [17, 22, 12, 15]]) {
        const f = createRenderFixture(t, width, height);
        f.engine.setCanvasBackground("blue");
        const target = f.createCanvas();
        assert.equal(f.engine.renderPreview(target, 15, 15), true);
        assert.deepEqual([target.width, target.height], [expectedWidth, expectedHeight]);
        validatePixels(getPixels(target).slice(-4), [0, 0, 255, 255]);
    }
});

test("preview bounds use whole available pixels and reject subpixel bounds without changing the target", function (t) {
    const f = createRenderFixture(t, 500, 400);
    f.engine.setCanvasBackground("blue");
    const target = f.createCanvas();
    assert.equal(f.engine.renderPreview(target, 63.9, 63.9), true);
    assert.deepEqual([target.width, target.height], [63, 50]);
    const pixels = getPixels(target);
    const state = f.engine.getState();
    const count = f.events.length;
    const canvasCount = f.canvases.length;

    for (const value of [0.5, Number.MIN_VALUE, 0, -1, NaN, Infinity, "64", null, undefined]) {
        for (const bounds of [[value, 64], [64, value]]) {
            assert.throws(function () { f.engine.renderPreview(target, ...bounds); }, {
                name: "TypeError", message: "createImage: preview dimensions must be finite numbers of at least 1 pixel."
            });
            assert.deepEqual([target.width, target.height], [63, 50]);
            validatePixels(getPixels(target), pixels);
        }
    }

    assert.deepEqual(f.engine.getState(), state);
    assert.equal(f.events.length, count);
    assert.equal(f.canvases.length, canvasCount);
});

test("canvas preview proxies refresh pixels and transparency without reallocating", function (t) {
    const f = createRenderFixture(t, 500, 400);
    const frame = f.createCanvas(1000, 800);
    const context = frame.getContext("2d");
    const source = frame;

    context.fillStyle = "red";
    context.fillRect(0, 0, 1000, 800);
    const id = addTestLayer(f, {source: source});
    f.engine.setLayerTransform(id, {scaleX: 0.5, scaleY: 0.5});
    const target = f.createCanvas();
    assert.equal(f.engine.renderPreview(target, 120, 120), true);
    validatePixels(target.getContext("2d").getImageData(10, 10, 1, 1).data, [255, 0, 0, 255]);
    const canvasCount = f.canvases.length;
    const eventCount = f.events.length;

    context.fillStyle = "blue";
    context.fillRect(0, 0, 1000, 800);
    assert.equal(f.engine.renderPreview(target, 120, 120), true);
    validatePixels(target.getContext("2d").getImageData(10, 10, 1, 1).data, [0, 0, 255, 255]);
    assert.equal(f.canvases.length, canvasCount);

    context.clearRect(0, 0, 1000, 800);
    context.fillStyle = "lime";
    context.fillRect(0, 0, 500, 800);
    assert.equal(f.engine.renderPreview(target, 60, 60), true);
    validatePixels(target.getContext("2d").getImageData(10, 10, 1, 1).data, [0, 255, 0, 255]);
    validatePixels(target.getContext("2d").getImageData(50, 10, 1, 1).data, [0, 0, 0, 0]);
    assert.equal(f.engine.renderPreview(target, 120, 120), true);
    validatePixels(target.getContext("2d").getImageData(100, 10, 1, 1).data, [0, 0, 0, 0]);
    assert.equal(f.canvases.length, canvasCount, "smaller requests retain the existing larger proxy");
    assert.equal(f.events.length, eventCount);
});

test("failed mutable proxy refresh uses the current source and can recover on the next preview", function (t) {
    const f = createRenderFixture(t, 500, 400);
    const source = f.createCanvas(1000, 800);
    const context = source.getContext("2d");
    context.fillStyle = "red";
    context.fillRect(0, 0, 1000, 800);
    const id = addTestLayer(f, {source: source});
    f.engine.setLayerTransform(id, {scaleX: 0.5, scaleY: 0.5});
    const target = f.createCanvas();
    assert.equal(f.engine.renderPreview(target, 120, 120), true);
    const proxy = f.canvases.at(-1);
    const canvasCount = f.canvases.length;
    context.fillStyle = "blue";
    context.fillRect(0, 0, 1000, 800);
    const draw = t.mock.method(proxy.getContext("2d"), "drawImage", function () {
        throw new Error("Proxy redraw failed.");
    });
    assert.equal(f.engine.renderPreview(target, 120, 120), true);
    validatePixels(target.getContext("2d").getImageData(10, 10, 1, 1).data, [0, 0, 255, 255]);
    draw.mock.restore();
    context.fillStyle = "lime";
    context.fillRect(0, 0, 1000, 800);
    assert.equal(f.engine.renderPreview(target, 120, 120), true);
    validatePixels(target.getContext("2d").getImageData(10, 10, 1, 1).data, [0, 255, 0, 255]);
    assert.equal(f.canvases.length, canvasCount);
});

test("static image previews retain cached pixels until a larger proxy is needed", async function (t) {
    const f = createRenderFixture(t, 500, 400);
    const frame = createPattern(f, 1000, 800);
    const source = await loadImage(frame.toDataURL("image/png"));
    const id = addTestLayer(f, {source: source});
    f.engine.setLayerTransform(id, {scaleX: 0.5, scaleY: 0.5});
    const target = f.createCanvas();
    const prototype = Object.getPrototypeOf(target.getContext("2d"));
    const drawImage = prototype.drawImage;
    let sourceDraws = 0;
    t.mock.method(prototype, "drawImage", function (image, ...args) {
        if (image === source) sourceDraws++;
        return drawImage.call(this, image, ...args);
    });

    assert.equal(f.engine.renderPreview(target, 120, 120), true);
    const canvasCount = f.canvases.length;
    assert.equal(f.engine.renderPreview(target, 60, 60), true);
    assert.equal(f.engine.renderPreview(target, 120, 120), true);
    assert.equal(sourceDraws, 1);
    assert.equal(f.canvases.length, canvasCount);
    assert.equal(f.engine.renderPreview(target, 240, 240), true);
    assert.equal(sourceDraws, 2);
    assert.equal(f.canvases.length, canvasCount + 1);
});

test("crop and straighten transform the composed document without changing its geometry", function (t) {
    const f = createRenderFixture(t, 100, 100);
    const source = f.createCanvas(100, 100);
    const context = source.getContext("2d");
    context.fillStyle = "red";
    context.fillRect(0, 0, 50, 100);
    context.fillStyle = "blue";
    context.fillRect(50, 0, 50, 100);
    addTestLayer(f, {source: source});
    f.engine.setCrop({x: 40, y: 10, width: 40, height: 40});
    f.engine.setStraighten(90);
    const state = f.engine.getState();
    const count = f.events.length;
    const target = getRendered(f);
    const expected = getPixels(target);
    assert.equal(target.width, 40);
    assert.equal(target.height, 40);
    assert.deepEqual(f.engine.pickColor(20.5, 30.5), {r: 255, g: 0, b: 0, a: 255, hex: "#ff0000"});
    assert.equal(f.engine.pickColor(60.5, 20.5), null, "straightened position lies outside the output");
    assert.equal(f.engine.pickColor(-1, 20), null);
    validatePixels(getPixels(getRendered(f, target)), expected);
    assert.deepEqual(f.engine.getState(), state);
    assert.equal(f.events.length, count);
});

test("pickColor stays in canvas coordinates and reports visible alpha without side effects", function (t) {
    const f = createRenderFixture(t, 20, 20);
    const source = f.createCanvas(20, 20);
    source.getContext("2d").fillStyle = "rgba(255,0,0,0.5)";
    source.getContext("2d").fillRect(5, 5, 10, 10);
    addTestLayer(f, {source: source});
    f.engine.setCrop({x: 4, y: 4, width: 12, height: 12});
    const state = f.engine.getState();
    const count = f.events.length;
    assert.equal(f.engine.pickColor(3, 10), null);
    assert.deepEqual(f.engine.pickColor(4, 4), {r: 0, g: 0, b: 0, a: 0, hex: "#000000"});
    const sample = f.engine.pickColor(8, 8);
    assert.deepEqual([sample.r, sample.g, sample.b, sample.hex], [255, 0, 0, "#ff0000"]);
    assert.ok(sample.a === 127 || sample.a === 128);
    assert.throws(function () { f.engine.pickColor(NaN, 0); }, TypeError);
    assert.deepEqual(f.engine.getState(), state);
    assert.equal(f.events.length, count);
});

test("mask restore recovers original alpha and captured selections constrain painted pixels", function (t) {
    const f = createRenderFixture(t, 20, 20);
    const source = f.createCanvas(20, 20);
    source.getContext("2d").fillStyle = "rgba(255,0,0,0.5)";
    source.getContext("2d").fillRect(0, 0, 20, 20);
    const id = addTestLayer(f, {source: source});
    const original = getPixels(getRendered(f));
    f.engine.createLayerMask(id);
    const operation = {points: [{x: 10, y: 10}], size: 60, hardness: 1, opacity: 1};
    f.engine.addLayerMaskOperation(id, {...operation, type: "erase"});
    assert.ok(getPixels(getRendered(f)).every(function (value) { return value === 0; }));
    f.engine.addLayerMaskOperation(id, {...operation, type: "restore"});
    validatePixels(getPixels(getRendered(f)), original);
    f.engine.setSelection({type: "rectangle", x: 0, y: 0, width: 10, height: 20});
    f.engine.addLayerPaintOperation(id, {type: "fill", x: 1, y: 1, color: "blue", opacity: 1, tolerance: 0});
    f.engine.clearSelection();
    const result = getPixels(getRendered(f));
    assert.deepEqual(Array.from(result.slice(0, 4)), [0, 0, 255, 255]);
    validatePixels(result.slice(15 * 4, 16 * 4), original.slice(15 * 4, 16 * 4));
});

test("explicit fill selection limits pixels in layer coordinates and null overrides the document selection", function (t) {
    const f = createRenderFixture(t, 64, 64);
    const id = addTestLayer(f, {source: f.createCanvas(20, 20)});
    f.engine.setLayerTransform(id, {x: 4, y: 5, scaleX: 2, scaleY: 2});
    f.engine.setSelection({type: "rectangle", x: 30, y: 30, width: 10, height: 10});
    const operation = {type: "fill", x: 1, y: 1, color: "red", opacity: 1, tolerance: 0};
    f.engine.addLayerPaintOperation(id, {...operation, selection: {type: "rectangle", x: 0, y: 0, width: 2, height: 2}});
    const target = getRendered(f);
    const context = target.getContext("2d");
    validatePixels(context.getImageData(6, 7, 1, 1).data, [255, 0, 0, 255]);
    validatePixels(context.getImageData(24, 25, 1, 1).data, [0, 0, 0, 0]);
    f.engine.addLayerPaintOperation(id, {...operation, x: 10, y: 10, color: "blue", selection: null});
    getRendered(f, target);
    validatePixels(context.getImageData(24, 25, 1, 1).data, [0, 0, 255, 255]);
});

test("render rejects source targets and unresolved assets without altering sources", function (t) {
    const f = createRenderFixture(t);
    const source = createPattern(f);
    addTestLayer(f, {source: source});
    const before = getPixels(source);
    assert.throws(function () { f.engine.render(source); }, TypeError);
    assert.throws(function () { f.engine.render({}); }, TypeError);
    const id = addTestLayer(f, {source: "asset:pending"});
    assert.equal(f.engine.render(f.createCanvas()), false);
    f.engine.setLayerVisibility(id, false);
    assert.equal(f.engine.render(f.createCanvas()), true);
    for (const value of [0, -1, NaN, Infinity]) assert.throws(function () { f.engine.renderPreview(f.createCanvas(), value, 100); }, TypeError);
    validatePixels(getPixels(source), before);
});

test("windowless image documents render, preview, sample and export their own canvases", async function (t) {
    const f = createFixture(t, {canvasWidth: 10, canvasHeight: 8, canvasBackground: "red"});
    f.document.defaultView = null;
    const target = f.createCanvas();
    const preview = f.createCanvas();

    for (const degrees of [0, 180]) {
        f.engine.setStraighten(degrees);
        const state = f.engine.getState();
        const events = f.events.length;
        assert.equal(f.engine.render(target), true);
        assert.deepEqual([target.width, target.height], [10, 8]);
        validatePixels(getPixels(target).slice(0, 4), [255, 0, 0, 255]);
        assert.equal(f.engine.renderPreview(preview, 5, 4), true);
        assert.deepEqual([preview.width, preview.height], [5, 4]);
        validatePixels(getPixels(preview).slice(0, 4), [255, 0, 0, 255]);
        assert.deepEqual(f.engine.pickColor(5, 4), {r: 255, g: 0, b: 0, a: 255, hex: "#ff0000"});
        const blob = await f.engine.exportImage();
        const decoded = await loadImage(Buffer.from(await blob.arrayBuffer()));
        assert.deepEqual([decoded.width, decoded.height], [10, 8]);
        const exported = f.createCanvas(10, 8);
        exported.getContext("2d").drawImage(decoded, 0, 0);
        validatePixels(getPixels(exported), getPixels(target));
        assert.deepEqual(f.engine.getState(), state);
        assert.equal(f.events.length, events);
    }
});

test("render rejects non-canvas targets with or without a document window", function (t) {
    const f = createRenderFixture(t);
    const window = f.document.defaultView;
    const fakeCanvas = {ownerDocument: f.document, getContext: function () { throw new Error("must not be called"); }};

    for (const view of [window, null]) {
        f.document.defaultView = view;
        for (const target of [null, {}, f.image, fakeCanvas]) {
            assert.throws(function () { f.engine.render(target); }, {
                name: "TypeError", message: "createImage: render target must be a <canvas> element."
            });
        }
    }
});

for (const history of ["undo", "redo", "transaction"]) {
    for (const method of ["render", "renderPreview"]) {
        test(method + " preserves sources retained only by " + history, function (t) {
            const f = createRenderFixture(t, 8, 8);
            const id = addTestLayer(f, {source: createPattern(f, 4, 4, false)});
            f.engine.setLayerTransform(id, {x: 2});
            assert.equal(f.engine.rasterizeLayer(id), true);
            const source = f.engine.getState().layers[0].source;
            const pixels = getPixels(source);
            const expected = getPixels(getRendered(f));

            if (history === "redo") {
                f.engine.undo();
            } else {
                if (history === "transaction") f.engine.beginTransaction();
                f.engine.removeLayer(id);
            }

            assert.equal(f.engine.getState().layers.some(function (layer) { return layer.source === source; }), false);
            const state = f.engine.getState();
            const count = f.events.length;
            assert.throws(function () { f.engine[method](source, 3, 3); }, TypeError);
            assert.deepEqual([source.width, source.height], [4, 4]);
            validatePixels(getPixels(source), pixels);
            assert.deepEqual(f.engine.getState(), state);
            assert.equal(f.events.length, count);

            assert.equal(f.engine[history === "transaction" ? "cancelTransaction" : history](), true);
            validatePixels(getPixels(getRendered(f)), expected);
        });
    }
}

test("render can reuse a former source after its history is discarded", function (t) {
    const f = createRenderFixture(t, 8, 8);
    const source = createPattern(f, 4, 4, false);
    const id = addTestLayer(f, {source: source});
    f.engine.removeLayer(id);
    f.engine.load(f.engine.serialize());
    assert.equal(f.engine.render(source), true);
    assert.deepEqual([source.width, source.height], [8, 8]);
});

test("Liquify output does not depend on the position of internal tile boundaries", function (t) {
    const original = createRenderFixture(t, 300, 180);
    const shifted = createRenderFixture(t, 300, 180);
    const source = createPattern(original, 300, 180);
    const padded = shifted.createCanvas(317, 180);
    padded.getContext("2d").drawImage(source, 17, 0);
    const first = addTestLayer(original, {source: source});
    const second = addTestLayer(shifted, {source: padded});
    shifted.engine.setLayerTransform(second, {x: -17});
    const operations = [
        {type: "push", points: [{x: 110, y: 70}, {x: 225, y: 100}], size: 140, strength: 0.9, density: 0.8, rate: 1},
        {type: "twirl", points: [{x: 200, y: 95}], size: 170, strength: 0.9, density: 0.5, rate: 1},
        {type: "bloat", points: [{x: 120, y: 95}, {x: 145, y: 115}], size: 100, strength: 0.8, density: 0.4, rate: 0.8},
        {type: "shrink", points: [{x: 245, y: 100}], size: 130, strength: -0.6, density: 0.7, rate: 0.8},
        {type: "restore", points: [{x: 130, y: 90}, {x: 240, y: 90}], size: 100, strength: 0.3, density: 0.3, rate: 0.4}
    ];
    for (const operation of operations) {
        original.engine.addLayerLiquifyOperation(first, operation);
        shifted.engine.addLayerLiquifyOperation(second, {...operation, points: operation.points.map(function (point) { return {x: point.x + 17, y: point.y}; })});
    }
    validatePixels(getPixels(getRendered(original)), getPixels(getRendered(shifted)));
});

for (const method of ["config", "setCanvasSize", "resizeDocument", "load", "crop"]) {
    test("positive subpixel dimensions stay drawable through " + method, async function (t) {
        for (const [width, height] of [[0.5, 5], [5, 0.5], [0.5, 0.5]]) {
            const f = createRenderFixture(t, method === "config" ? width : 20, method === "config" ? height : 20);
            f.engine.setCanvasBackground("red");
            if (method === "crop") {
                f.engine.setCrop({x: 1, y: 1, width: width, height: height});
            } else if (method === "load") {
                f.engine.load({...f.engine.serialize(), canvasWidth: width, canvasHeight: height});
            } else if (method !== "config") {
                f.engine[method](width, height);
            }
            const dimensions = [width < 1 ? 1 : width, height < 1 ? 1 : height];
            const target = f.createCanvas();
            const preview = f.createCanvas();
            for (const degrees of [0, 180]) {
                f.engine.setStraighten(degrees);
                const document = f.engine.serialize();
                const events = f.events.length;
                assert.equal(f.engine.render(target), true);
                assert.deepEqual([target.width, target.height], dimensions);
                assert.ok(getPixels(target).some(function (value, index) { return index % 4 === 3 && value > 0; }));
                assert.equal(f.engine.renderPreview(preview, 10, 10), true);
                assert.deepEqual([preview.width, preview.height], dimensions);
                validatePixels(getPixels(preview), getPixels(target));
                const sampleX = method === "crop" ? (degrees ? 20 - 1 - width / 2 : 1 + width / 2) : width / 2;
                const sampleY = method === "crop" ? (degrees ? 20 - 1 - height / 2 : 1 + height / 2) : height / 2;
                const color = f.engine.pickColor(sampleX, sampleY);
                assert.ok(color && color.r === 255 && color.a > 0);
                assert.deepEqual(f.engine.serialize(), document);
                assert.equal(f.events.length, events);
            }
            const blob = await f.engine.exportImage();
            const decoded = await loadImage(Buffer.from(await blob.arrayBuffer()));
            assert.deepEqual([decoded.width, decoded.height], dimensions);
            const exported = f.createCanvas(...dimensions);
            exported.getContext("2d").drawImage(decoded, 0, 0);
            validatePixels(getPixels(exported), getPixels(target), 1);
        }
    });
}

test("raster dimensions retain existing flooring above one pixel", function (t) {
    const f = createRenderFixture(t, 1.9, 5.9);
    f.engine.setCanvasBackground("red");
    const target = getRendered(f);
    assert.deepEqual([target.width, target.height], [1, 5]);
    assert.equal(f.engine.renderPreview(target, 10, 10), true);
    assert.deepEqual([target.width, target.height], [1, 5]);
    validatePixels(getPixels(target).slice(0, 4), [255, 0, 0, 255]);
});

for (const cropped of [false, true]) {
    test("pickColor rejects fractional " + (cropped ? "crop" : "document") + " edges outside the rendered pixels", function (t) {
        const f = createRenderFixture(t, cropped ? 20 : 1.9, cropped ? 20 : 5.9);
        const x = cropped ? 1.25 : 0;
        const y = cropped ? 2.5 : 0;
        f.engine.setCanvasBackground("red");
        if (cropped) f.engine.setCrop({x: x, y: y, width: 1.9, height: 5.9});

        const target = getRendered(f);
        assert.deepEqual([target.width, target.height], [1, 5]);
        assert.deepEqual(f.engine.pickColor(x + 0.5, y + 2), {r: 255, g: 0, b: 0, a: 255, hex: "#ff0000"});
        assert.equal(f.engine.pickColor(x + 1.5, y + 2), null, "right fractional strip has no output pixel");
        assert.equal(f.engine.pickColor(x + 0.5, y + 5.5), null, "bottom fractional strip has no output pixel");
        assert.equal(f.engine.pickColor(x + 1.5, y + 5.5), null, "fractional corner has no output pixel");
    });
}
