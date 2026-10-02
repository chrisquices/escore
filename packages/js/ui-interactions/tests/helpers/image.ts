import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createImage} from 'strata-packages/ui-interactions/image';

const require = createRequire(import.meta.url);
const {createCanvas} = require("@napi-rs/canvas");
const canvasType = createCanvas(1, 1).constructor;

export const modifiers = [
    {name: "Mask", key: "mask", type: "erase", index: "operationIndex"},
    {name: "Liquify", key: "liquify", type: "push", index: "historyIndex"},
    {name: "Paint", key: "paint", type: "brush", index: "historyIndex"},
    {name: "Retouch", key: "retouch", type: "clone", index: "historyIndex"}
];

export function createFixture(test, config = {}, options = {}) {
    const document = new EventTarget();
    const viewport = new EventTarget();
    const image = new EventTarget();
    const rect = {left: 10, top: 20, width: 900, height: 700};
    const events = [];
    const canvases = [];
    const pending = new Map();
    const cancelled = [];
    let nextFrame = 0;
    let resizeCallback = null;
    let disconnected = false;

    document.defaultView = {
        HTMLCanvasElement: canvasType,
        ResizeObserver: function (callback) {
            resizeCallback = callback;

            return {
                observe() {},
                disconnect() {
                    disconnected = true;
                }
            };
        }
    };

    if (options.frames !== false) {
        document.defaultView.requestAnimationFrame = function (callback) {
            assert.equal(this, document.defaultView);
            const id = nextFrame++;
            pending.set(id, callback);
            return id;
        };
        document.defaultView.cancelAnimationFrame = function (id) {
            assert.equal(this, document.defaultView);
            cancelled.push(id);
            pending.delete(id);
        };
    }

    function createTestCanvas(width = 32, height = 24) {
        const canvas = createCanvas(width, height);
        canvas.ownerDocument = document;
        canvases.push(canvas);
        return canvas;
    }

    document.createElement = function (name) {
        assert.equal(name, "canvas");
        return createTestCanvas();
    };
    viewport.getBoundingClientRect = function () {
        return {...rect};
    };
    viewport.requestFullscreen = async function () {
        document.fullscreenElement = viewport;
        dispatch(document, "fullscreenchange");
        dispatch(document, "webkitfullscreenchange");
    };
    document.exitFullscreen = async function () {
        document.fullscreenElement = null;
        dispatch(document, "fullscreenchange");
        dispatch(document, "webkitfullscreenchange");
    };

    Object.assign(image, {
        ownerDocument: document,
        parentElement: viewport,
        naturalWidth: 2880,
        naturalHeight: 5120,
        complete: true,
        src: "asset:image",
        getBoundingClientRect: viewport.getBoundingClientRect,
        getAttribute(name) {
            return this[name] || null;
        }
    }, options.image);

    const engine = createImage(image, {
        viewport: viewport,
        canvasWidth: 1000,
        canvasHeight: 800,
        minZoom: 0.01,
        panBounds: "free",
        onChange: function (state) {
            events.push(state);
        },
        ...config
    });

    function dispatch(target, type, properties = {}) {
        const event = new Event(type, {cancelable: true});
        Object.assign(event, properties);
        target.dispatchEvent(event);
        return event;
    }

    function notifyResize() {
        if (!disconnected) resizeCallback();
    }

    function flushFrames() {
        for (const [id, callback] of Array.from(pending)) {
            if (pending.delete(id)) callback();
        }
    }

    function dispatchPointer(type, id, x, y) {
        return dispatch(viewport, type, {pointerId: id, clientX: x, clientY: y, pointerType: "touch", button: 0});
    }

    notifyResize();
    events.length = 0;

    test.after(function () {
        engine.destroy();
        for (const canvas of canvases) {
            canvas.width = 0;
            canvas.height = 0;
        }
    });

    return {engine, image, document, viewport, rect, events, canvases, pending, cancelled, createCanvas: createTestCanvas, dispatch, dispatchPointer, notifyResize, flushFrames};
}

export function addTestLayer(fixture, config = {}) {
    const source = config.source === undefined ? fixture.createCanvas() : config.source;
    return fixture.engine.addLayer({source: source, sourceReference: typeof source === "string" ? source : "asset:layer", ...config});
}

export function createOperation(type, x = 10) {
    return {
        type: type,
        points: [{x: x, y: 10}, {x: x + 12, y: 16}],
        size: 12,
        hardness: 0.5,
        opacity: 0.7,
        strength: 0.6,
        density: 0.5,
        rate: 0.6,
        color: "red",
        sourceX: 3,
        sourceY: 4
    };
}

export function createPattern(fixture, width = 96, height = 80, alpha = true) {
    const canvas = fixture.createCanvas(width, height);
    const context = canvas.getContext("2d");
    const pixels = context.createImageData(width, height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const index = (y * width + x) * 4;
            pixels.data[index] = (x * 9 + y * 3) % 256;
            pixels.data[index + 1] = (x * 2 + y * 13) % 256;
            pixels.data[index + 2] = (x * 7 + y * 11) % 256;
            pixels.data[index + 3] = alpha ? ((x + y) % 9 ? 128 + (x * 7 + y * 11) % 128 : 0) : 255;
        }
    }

    context.putImageData(pixels, 0, 0);
    return canvas;
}

export function getPixels(canvas) {
    return canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
}

export function validatePixels(actual, expected, tolerance = 0) {
    assert.equal(actual.length, expected.length);

    for (let index = 0; index < actual.length; index++) {
        assert.ok(Math.abs(actual[index] - expected[index]) <= tolerance, "Pixel channel " + index + ": " + actual[index] + " != " + expected[index]);
    }
}

export function validatePoint(actual, expected) {
    assert.ok(actual);
    assert.ok(Math.abs(actual.x - expected.x) < 0.000001, "x: " + actual.x + " != " + expected.x);
    assert.ok(Math.abs(actual.y - expected.y) < 0.000001, "y: " + actual.y + " != " + expected.y);
}

export function validateFrozen(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return;
    assert.ok(Object.isFrozen(snapshot));

    for (const name of Object.keys(snapshot)) {
        if (name !== "source") validateFrozen(snapshot[name]);
    }
}
