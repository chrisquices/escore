import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture, addTestLayer, validatePoint} from './helpers/image.ts';

test("viewport coordinates are local to the viewport and use canvas rather than source dimensions", function (t) {
    const f = createFixture(t, {canvasWidth: 100, canvasHeight: 200});
    f.engine.setZoom(2);
    f.engine.setPan(30, 40);
    validatePoint(f.engine.canvasToViewport(0, 0), {x: 380, y: 190});
    validatePoint(f.engine.viewportToCanvas(380, 190), {x: 0, y: 0});
    validatePoint(f.engine.canvasToViewport(50, 100), {x: 480, y: 390});
    assert.equal(f.engine.getState().naturalWidth, 2880);
});

test("cover keeps every viewport corner inside the canvas after rotation, resize and flips", function (t) {
    const f = createFixture(t, {canvasWidth: 100, canvasHeight: 100, fitMode: "cover", maxZoom: 20});
    f.rect.width = 100;
    f.rect.height = 100;
    f.notifyResize();
    f.engine.setRotation(45);
    assert.equal(f.engine.getState().scale, 1.4142);

    for (const [width, height, viewportWidth, viewportHeight] of [[100, 100, 100, 100], [200, 80, 150, 90], [80, 200, 90, 150]]) {
        f.engine.setCanvasSize(width, height);
        f.rect.width = viewportWidth;
        f.rect.height = viewportHeight;
        f.notifyResize();
        for (const rotation of [0, 30, 45, 90, 135, 270]) {
            f.engine.setRotation(rotation);
            for (const [flipX, flipY] of [[false, false], [true, false], [false, true], [true, true]]) {
                f.engine.setFlipHorizontal(flipX);
                f.engine.setFlipVertical(flipY);
                for (const [x, y] of [[0, 0], [viewportWidth, 0], [0, viewportHeight], [viewportWidth, viewportHeight]]) {
                    const point = f.engine.viewportToCanvas(x, y);
                    assert.ok(point.x >= -0.000001 && point.x <= width + 0.000001, "viewport corner x must remain inside the canvas");
                    assert.ok(point.y >= -0.000001 && point.y <= height + 0.000001, "viewport corner y must remain inside the canvas");
                }
            }
        }
    }
});

test("rotated contain bounds prevent panning beyond the image edges", function (t) {
    const f = createFixture(t, {canvasWidth: 100, canvasHeight: 100, fitMode: "cover", panBounds: "contain", maxZoom: 20});
    f.rect.width = 100;
    f.rect.height = 100;
    f.notifyResize();
    f.engine.setRotation(45);
    f.engine.setPan(50, 0);
    validatePoint(f.engine.canvasToViewport(50, 50), {x: 50, y: 50});
    assert.equal(f.engine.getState().canPan, false);

    for (const [width, height, viewportWidth, viewportHeight] of [[100, 100, 100, 100], [200, 80, 150, 90], [80, 200, 90, 150]]) {
        f.engine.setCanvasSize(width, height);
        f.rect.width = viewportWidth;
        f.rect.height = viewportHeight;
        f.notifyResize();
        for (const rotation of [0, 30, 45, 90, 135, 270]) {
            f.engine.setRotation(rotation);
            for (const zoom of [1, 1.7]) {
                f.engine.setFitMode("cover");
                if (zoom > 1) f.engine.zoomIn(zoom);
                for (const [flipX, flipY] of [[false, false], [true, false], [false, true], [true, true]]) {
                    f.engine.setFlipHorizontal(flipX);
                    f.engine.setFlipVertical(flipY);
                    for (const [panX, panY] of [[10000, 10000], [-10000, 10000], [10000, -10000], [-10000, -10000]]) {
                        f.engine.setPan(panX, panY);
                        for (const [x, y] of [[0, 0], [viewportWidth, 0], [0, viewportHeight], [viewportWidth, viewportHeight]]) {
                            const point = f.engine.viewportToCanvas(x, y);
                            assert.ok(point.x >= -0.000001 && point.x <= width + 0.000001, "panning must keep the viewport inside the image horizontally");
                            assert.ok(point.y >= -0.000001 && point.y <= height + 0.000001, "panning must keep the viewport inside the image vertically");
                        }
                        const count = f.events.length;
                        f.engine.setPan(panX, panY);
                        assert.equal(f.events.length, count, "the same clamped pan must not notify twice");
                    }
                }
            }
        }
    }
});

test("contain panning centers undersized image axes while free panning remains unrestricted", function (t) {
    const f = createFixture(t, {canvasWidth: 400, canvasHeight: 100, panBounds: "contain"});
    f.rect.width = 100;
    f.rect.height = 100;
    f.notifyResize();
    f.engine.setZoom(0.5);
    f.engine.setPan(1000, 1000);
    validatePoint(f.engine.canvasToViewport(200, 50), {x: 100, y: 50});
    f.engine.setRotation(45);
    f.engine.setPan(1000, 1000);
    const center = f.engine.canvasToViewport(200, 50);
    assert.ok(center.x > 50 && center.y > 50);
    assert.ok(Math.abs(center.x - center.y) < 0.000001, "only the rotated long axis can pan");
    assert.equal(f.engine.getState().canPan, true);
    f.engine.setFitMode("contain");
    f.engine.setPan(1000, 1000);
    validatePoint(f.engine.canvasToViewport(200, 50), {x: 50, y: 50});
    assert.equal(f.engine.getState().canPan, false);

    const free = createFixture(t, {panBounds: "free"});
    free.engine.setRotation(45);
    free.engine.setPan(1000, -1000);
    assert.deepEqual([free.engine.getState().offsetX, free.engine.getState().offsetY], [1000, -1000]);
});

for (const rotation of [0, 37, 90, 270]) {
    for (const flips of [[false, false], [true, false], [false, true], [true, true]]) {
        test("viewport/canvas round trip at rotation " + rotation + " and flips " + flips, function (t) {
            const f = createFixture(t);
            f.engine.setZoom(2.75);
            f.engine.setPan(123, -87);
            f.engine.setRotation(rotation);
            f.engine.setFlipHorizontal(flips[0]);
            f.engine.setFlipVertical(flips[1]);
            const before = f.engine.getState();
            const count = f.events.length;
            for (const point of [{x: 0, y: 0}, {x: 400, y: 300}, {x: -500, y: 1200}]) {
                const canvas = f.engine.viewportToCanvas(point.x, point.y);
                validatePoint(f.engine.canvasToViewport(canvas.x, canvas.y), point);
                const viewport = f.engine.canvasToViewport(point.x, point.y);
                validatePoint(f.engine.viewportToCanvas(viewport.x, viewport.y), point);
            }
            assert.deepEqual(f.engine.getState(), before);
            assert.equal(f.events.length, count);
        });
    }
}

test("layer/canvas conversion follows position, scale, rotation and flips without clamping", function (t) {
    const f = createFixture(t);
    const id = addTestLayer(f);
    f.engine.setLayerTransform(id, {x: 10, y: 20, scaleX: 2, scaleY: 3, rotation: 90, flipX: true});
    validatePoint(f.engine.layerToCanvas(id, 4, 5), {x: -5, y: 12});
    validatePoint(f.engine.canvasToLayer(id, -5, 12), {x: 4, y: 5});
    for (const rotation of [0, 15, 90, 210]) {
        for (const flipY of [false, true]) {
            f.engine.setLayerTransform(id, {rotation: rotation, flipY: flipY});
            for (const point of [{x: 0, y: 0}, {x: 15, y: 8}, {x: -100, y: 150}]) {
                const canvas = f.engine.layerToCanvas(id, point.x, point.y);
                validatePoint(f.engine.canvasToLayer(id, canvas.x, canvas.y), point);
            }
        }
    }
});

test("perspective corners and inverse conversion use the same layer transform", function (t) {
    const f = createFixture(t);
    const id = addTestLayer(f, {source: f.createCanvas(100, 80)});
    const perspective = {topLeft: {x: 5, y: 8}, topRight: {x: 110, y: -4}, bottomRight: {x: 93, y: 91}, bottomLeft: {x: -9, y: 75}};
    f.engine.setLayerPerspective(id, perspective);
    for (const [point, expected] of [[{x: 0, y: 0}, perspective.topLeft], [{x: 100, y: 0}, perspective.topRight], [{x: 100, y: 80}, perspective.bottomRight], [{x: 0, y: 80}, perspective.bottomLeft]]) {
        validatePoint(f.engine.layerToCanvas(id, point.x, point.y), expected);
        validatePoint(f.engine.canvasToLayer(id, expected.x, expected.y), point);
    }
    f.engine.setLayerTransform(id, {x: 50, y: 60, scaleX: 0.5, scaleY: 2, rotation: 27, flipX: true, flipY: true});
    for (const point of [{x: 12, y: 18}, {x: 50, y: 40}, {x: -3, y: 90}]) {
        const canvas = f.engine.layerToCanvas(id, point.x, point.y);
        validatePoint(f.engine.canvasToLayer(id, canvas.x, canvas.y), point);
    }
    const before = f.engine.layerToCanvas(id, 12, 18);
    f.engine.setZoom(4);
    f.engine.setPan(100, 50);
    f.engine.setRotation(90);
    validatePoint(f.engine.layerToCanvas(id, 12, 18), before);
    f.engine.clearLayerPerspective(id);
    assert.equal(f.engine.getState().layers[0].transform.perspective, null);
});

test("coordinate validation rejects non-finite values and unknown layers return false", function (t) {
    const f = createFixture(t);
    const id = addTestLayer(f);
    for (const value of [NaN, Infinity, -Infinity]) {
        for (const name of ["viewportToCanvas", "canvasToViewport"]) {
            assert.throws(function () { f.engine[name](value, 0); }, TypeError);
            assert.throws(function () { f.engine[name](0, value); }, TypeError);
        }
        for (const name of ["canvasToLayer", "layerToCanvas"]) {
            assert.throws(function () { f.engine[name](id, value, 0); }, TypeError);
            assert.throws(function () { f.engine[name](id, 0, value); }, TypeError);
        }
    }
    assert.equal(f.engine.canvasToLayer("missing", 1, 2), false);
    assert.equal(f.engine.layerToCanvas("missing", 1, 2), false);
});
