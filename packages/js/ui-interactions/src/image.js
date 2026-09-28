import {createNotifier, createErrorReporter} from './internal/core.js';

/** @import * as ImageTypes from './image.d.ts' */
/** @import * as ImageInternal from './internal/image-types.d.ts' */
/** @import * as ImageRender from './internal/image-render-types.d.ts' */

/** @param {number} value @param {number} places */
function roundTo(value, places) {
    const factor = Math.pow(10, places);

    return Math.round(value * factor) / factor;
}

/**
 * @param {HTMLImageElement} image
 * @param {ImageTypes.ImageConfig} [config]
 * @returns {ImageTypes.ImageEngine}
 */
export function createImage(image, config = {}) {
    if (!image || typeof image.addEventListener !== "function" || typeof image.getBoundingClientRect !== "function" || !("naturalWidth" in image)) {
        throw new TypeError("createImage: 'image' must be an <img> element.");
    }

    // region ===== Config =============================================================================================
    const {
        onChange, onError,
        viewport: configuredViewport = image.parentElement,
        src,
        canvasWidth,
        canvasHeight,
        canvasBackground = "transparent",
        fitMode = "contain",
        minZoom = "fit", maxZoom = 8, zoomStep = 1.25,
        panBounds = "contain",
        rotationStep = 90,
        wheelZoom = true, dragPan = true, pinchZoom = true, doubleClickZoom = true,
        keyboardShortcuts = true
    } = config;

    const viewport = /** @type {ImageInternal.FullscreenViewport} */ (configuredViewport);
    validateConfig();

    function validateConfig() {

        // On Change
        if (onChange !== undefined && typeof onChange !== "function") {
            throw new TypeError("createImage: the 'onChange' option must be a function when provided.");
        }

        // On Error
        if (onError !== undefined && typeof onError !== "function") {
            throw new TypeError("createImage: the 'onError' option must be a function when provided.");
        }

        // Viewport — the box the view is measured against and where pointer/wheel/resize listeners live.
        if (!viewport || typeof viewport.addEventListener !== "function" || typeof viewport.getBoundingClientRect !== "function") {
            throw new TypeError("createImage: the 'viewport' option must be a DOM element (defaults to the image's parent).");
        }

        // Src
        if (src !== undefined && typeof src !== "string") {
            throw new TypeError("createImage: the 'src' option must be a string when provided.");
        }

        // Canvas Width
        if (canvasWidth !== undefined && (typeof canvasWidth !== "number" || !Number.isFinite(canvasWidth) || canvasWidth <= 0)) {
            throw new TypeError("createImage: the 'canvasWidth' option must be a positive number when provided.");
        }

        // Canvas Height
        if (canvasHeight !== undefined && (typeof canvasHeight !== "number" || !Number.isFinite(canvasHeight) || canvasHeight <= 0)) {
            throw new TypeError("createImage: the 'canvasHeight' option must be a positive number when provided.");
        }

        // Canvas Size
        if ((canvasWidth === undefined) !== (canvasHeight === undefined)) {
            throw new TypeError("createImage: the 'canvasWidth' and 'canvasHeight' options must be provided together.");
        }

        // Canvas Background
        if (typeof canvasBackground !== "string") {
            throw new TypeError("createImage: the 'canvasBackground' option must be a string.");
        }

        // Fit Mode
        if (!["contain", "cover", "actual"].includes(fitMode)) {
            throw new TypeError("createImage: the 'fitMode' option must be 'contain', 'cover', or 'actual'.");
        }

        // Min Zoom
        if (minZoom !== "fit" && (typeof minZoom !== "number" || !Number.isFinite(minZoom) || minZoom <= 0)) {
            throw new TypeError("createImage: the 'minZoom' option must be 'fit' or a positive number.");
        }

        // Max Zoom
        if (typeof maxZoom !== "number" || !Number.isFinite(maxZoom) || maxZoom <= 0) {
            throw new TypeError("createImage: the 'maxZoom' option must be a positive number.");
        }

        // Zoom Step
        if (typeof zoomStep !== "number" || !Number.isFinite(zoomStep) || zoomStep <= 1) {
            throw new TypeError("createImage: the 'zoomStep' option must be a number greater than 1.");
        }

        // Pan Bounds
        if (!["contain", "free"].includes(panBounds)) {
            throw new TypeError("createImage: the 'panBounds' option must be 'contain' or 'free'.");
        }

        // Rotation Step
        if (typeof rotationStep !== "number" || !Number.isFinite(rotationStep) || rotationStep <= 0) {
            throw new TypeError("createImage: the 'rotationStep' option must be a positive number of degrees.");
        }

        // Wheel Zoom
        if (typeof wheelZoom !== "boolean") {
            throw new TypeError("createImage: the 'wheelZoom' option must be a boolean.");
        }

        // Drag Pan
        if (typeof dragPan !== "boolean") {
            throw new TypeError("createImage: the 'dragPan' option must be a boolean.");
        }

        // Pinch Zoom
        if (typeof pinchZoom !== "boolean") {
            throw new TypeError("createImage: the 'pinchZoom' option must be a boolean.");
        }

        // Double Click Zoom
        if (typeof doubleClickZoom !== "boolean") {
            throw new TypeError("createImage: the 'doubleClickZoom' option must be a boolean.");
        }

        // Keyboard Shortcuts
        if (typeof keyboardShortcuts !== "boolean") {
            throw new TypeError("createImage: the 'keyboardShortcuts' option must be a boolean.");
        }
    }

    // endregion

    // region ===== Init ===============================================================================================
    /** @type {ImageInternal.ImageDocument} */
    const ownerDocument = image.ownerDocument; // the image's own document, so reads work across realms/iframes
    let destroyed = false; // late load/resize events must not still fire callbacks after teardown

    function init() {

        registerAllEventListeners();

        // Apply the configured source (if any); the load event then sets the initial fitted view
        if (src) applySource(src);

        // An already-cached image won't fire load, so fit it now
        if (image.complete && image.naturalWidth) {
            loaded = true;
            loadedSource = getSource();
            loadedWidth = getNaturalWidth();
            loadedHeight = getNaturalHeight();

            if (!canvasWidthState && !canvasHeightState) {
                canvasWidthState = getNaturalWidth();
                canvasHeightState = getNaturalHeight();
                markDocumentChanged();
            }

            applyFit();
        } else if (!src && image.complete && getSource()) {
            // A failure before initialization has no new error event to update the loading state.
            hasError = true;
            errorMessage = "The image could not be loaded.";
        }

        // Subscriptions start from the initialized snapshot; the consumer reads it for the first paint.
        lastNotificationState = getStateSnapshot(getCachedDocumentSnapshot());
        if (onChange) subscribe(onChange);
    }

    // endregion

    // region ===== Event Listeners ====================================================================================
    /** @type {Array<() => void>} */
    const cleanups = []; // teardown functions, collected so everything can be undone at once
    /** @type {ResizeObserver | null} */
    let resizeObserver = null; // watches the viewport so the fit recomputes when its box changes

    /**
     * @template {keyof HTMLElementEventMap | "webkitfullscreenchange"} K
     * @param {EventTarget} target
     * @param {K} type
     * @param {(event: K extends keyof HTMLElementEventMap ? HTMLElementEventMap[K] : Event) => void} handler
     * @param {AddEventListenerOptions} [options]
     */
    function registerEventListener(target, type, handler, options) {
        target.addEventListener(type, /** @type {EventListener} */ (handler), options);

        cleanups.push(function () {
            target.removeEventListener(type, /** @type {EventListener} */ (handler), options); // detach the exact listener that was registered
        });
    }

    function registerAllEventListeners() {

        // Source Loading
        registerEventListener(image, "load", function () {
            const nextSource = getSource();
            const nextWidth = getNaturalWidth();
            const nextHeight = getNaturalHeight();
            const canvasSizeChanged = !canvasWidthState && !canvasHeightState && (canvasWidthState !== nextWidth || canvasHeightState !== nextHeight);
            const changed = !loaded || hasError || loadedSource !== nextSource || loadedWidth !== nextWidth || loadedHeight !== nextHeight || canvasSizeChanged;
            const previousScale = scale;
            const previousX = offsetX;
            const previousY = offsetY;

            loaded = true;
            hasError = false;
            errorMessage = "";
            loadedSource = nextSource;
            loadedWidth = nextWidth;
            loadedHeight = nextHeight;

            if (!canvasWidthState && !canvasHeightState) {
                canvasWidthState = getNaturalWidth();
                canvasHeightState = getNaturalHeight();
                if (canvasSizeChanged) markDocumentChanged();
            }

            if (canvasSizeChanged) {
                applyFit(); // first intrinsic dimensions establish the initial view
            } else {
                refitIfFitted();
            }
            if (changed || scale !== previousScale || offsetX !== previousX || offsetY !== previousY) notify();
        });

        registerEventListener(image, "error", function () {
            reportImageError();
        });

        // Fullscreen — external exits (Esc) must re-emit so the consumer's fullscreen state stays in sync
        registerEventListener(ownerDocument, "fullscreenchange", function () {
            handleFullscreenChange();
        });

        registerEventListener(ownerDocument, "webkitfullscreenchange", function () {
            handleFullscreenChange();
        });

        // Viewport Resize — a changed viewport box changes the fit, so keep a fitted image fitted
        if (typeof ownerDocument.defaultView?.ResizeObserver === "function") {
            resizeObserver = new ownerDocument.defaultView.ResizeObserver(function () {
                handleViewportResize();
            });

            resizeObserver.observe(viewport);

            cleanups.push(function () {
                resizeObserver?.disconnect();
            });
        }

        // Pointer Gestures — drag-pan, pinch-zoom, and double-tap; each idiom is gated inside its handler
        registerEventListener(viewport, "pointerdown", function (event) {
            handlePointerDown(event);
        });

        registerEventListener(viewport, "pointermove", function (event) {
            handlePointerMove(event);
        });

        registerEventListener(viewport, "pointerup", function (event) {
            handlePointerUp(event);
        });

        registerEventListener(viewport, "pointercancel", function (event) {
            handlePointerUp(event);
        });

        registerEventListener(viewport, "lostpointercapture", function (event) {
            handlePointerUp(event);
        });

        registerEventListener(image, "dragstart", function (event) {
            handleImageDragStart(event);
        });

        // Wheel Zoom — non-passive so it can prevent the page from scrolling while zooming
        registerEventListener(viewport, "wheel", function (event) {
            handleWheel(event);
        }, {passive: false});

        // Keyboard Shortcuts
        registerEventListener(viewport, "keydown", function (event) {
            handleKeyboardShortcut(event);
        });
    }

    function handleViewportResize() {
        if (destroyed) return;

        refitIfFitted();
        const state = getStateSnapshot(getCachedDocumentSnapshot());
        const previous = lastNotificationState;

        if (!previous || /** @type {Array<keyof ImageTypes.ImageState>} */ (Object.keys(state)).some(function (key) {
            return !Object.is(state[key], previous[key]);
        })) notify();
    }

    // endregion

    // region ===== Error Handling =====================================================================================
    const reportError = createErrorReporter(onError);

    function reportImageError() {
        if (destroyed) return;

        const changed = !hasError || loaded;
        const message = "The image could not be loaded.";

        hasError = true;
        loaded = false;
        errorMessage = message;
        if (changed) notify();
        if (destroyed) return;

        reportError("image-load-failed", message);
    }

    // endregion

    // region ===== State ==============================================================================================
    let documentRevision = 0;
    let cachedDocumentRevision = -1;
    /** @type {ImageInternal.DocumentSnapshot | null} */
    let cachedDocumentSnapshot = null;
    /** @type {WeakMap<object, object>} */
    let cachedOperationSnapshots = new WeakMap();
    /** @type {ImageTypes.ImageState | null} */
    let lastNotificationState = null;

    const notifier = createNotifier(getNotificationState, {
        requestFrame: typeof ownerDocument.defaultView?.requestAnimationFrame === "function" ? ownerDocument.defaultView.requestAnimationFrame.bind(ownerDocument.defaultView) : undefined,
        cancelFrame: typeof ownerDocument.defaultView?.cancelAnimationFrame === "function" ? ownerDocument.defaultView.cancelAnimationFrame.bind(ownerDocument.defaultView) : undefined
    });

    /** @type {Map<(state: ImageTypes.ImageState) => void, () => void>} */
    const subscriptions = new Map();
    const notify = notifier.notify;
    const notifyFrame = notifier.notifyFrame;

    // Compare per listener so a reentrant change cannot starve subscribers still awaiting this snapshot.
    /** @type {ImageTypes.ImageEngine['subscribe']} */
    function subscribe(listener) {
        if (typeof listener !== "function") {
            throw new TypeError("createImage: 'listener' must be a function.");
        }
        if (destroyed) return function unsubscribe() {};

        const existing = subscriptions.get(listener);
        if (existing) return existing;

        let previous = getStateSnapshot(getCachedDocumentSnapshot());
        const detach = notifier.subscribe(function (state) {
            if (/** @type {Array<keyof ImageTypes.ImageState>} */ (Object.keys(state)).every(function (key) {
                return Object.is(state[key], previous[key]);
            })) return;

            previous = {...state};
            listener({...state});
        });

        function unsubscribe() {
            if (subscriptions.get(listener) === unsubscribe) subscriptions.delete(listener);
            detach();
        }

        subscriptions.set(listener, unsubscribe);
        return unsubscribe;
    }

    /** @param {number} canvasWidth @param {number} canvasHeight @param {ImageInternal.ViewportSize} viewportSize */
    function canPan(canvasWidth, canvasHeight, viewportSize) {
        if (panBounds === "free") return canvasWidth > 0 && canvasHeight > 0;

        const bounds = getContainPanBounds(canvasWidth, canvasHeight, viewportSize);

        return bounds.maxX > 0.25 || bounds.maxY > 0.25;
    }

    function markDocumentChanged() {
        documentRevision++;
    }

    function getCachedDocumentSnapshot() {
        if (!cachedDocumentSnapshot || cachedDocumentRevision !== documentRevision) {
            cachedDocumentSnapshot = freezeDocumentSnapshot(getDocumentSnapshot(true));
            cachedDocumentRevision = documentRevision;
        }

        return cachedDocumentSnapshot;
    }

    /** @template {object} T @param {T} operation @param {(operation: T) => T} getSnapshot @returns {T} */
    function getCachedOperationSnapshot(operation, getSnapshot) {
        let snapshot = cachedOperationSnapshots.get(operation);

        if (!snapshot) {
            snapshot = freezeDocumentSnapshot(getSnapshot(operation));
            cachedOperationSnapshots.set(operation, snapshot);
        }

        return /** @type {T} */ (snapshot);
    }

    /** @template {object} T @param {T} snapshot @returns {T} */
    function freezeDocumentSnapshot(snapshot) {
        if (Object.isFrozen(snapshot)) return snapshot;

        // Sources remain runtime references; only copied document data is frozen.
        for (const name of Object.keys(snapshot)) {
            const value = /** @type {Record<string, unknown>} */ (snapshot)[name];
            if (name !== "source" && value && typeof value === "object") freezeDocumentSnapshot(value);
        }

        return Object.freeze(snapshot);
    }

    /** @param {boolean} [cacheOperations] @returns {ImageInternal.DocumentSnapshot} */
    function getDocumentSnapshot(cacheOperations = false) {
        return {
            canvasWidth: getCanvasWidth(),
            canvasHeight: getCanvasHeight(),
            canvasBackground: getCanvasBackground(),
            layers: layers.map(function (layer) {
                return {
                    id: layer.id,
                    source: layer.source,
                    sourceReference: layer.sourceReference,
                    name: layer.name,
                    visible: layer.visible,
                    opacity: layer.opacity,
                    transform: {
                        x: layer.transform.x,
                        y: layer.transform.y,
                        scaleX: layer.transform.scaleX,
                        scaleY: layer.transform.scaleY,
                        rotation: layer.transform.rotation,
                        flipX: layer.transform.flipX,
                        flipY: layer.transform.flipY,
                        perspective: getLayerPerspectiveState(layer.transform.perspective)
                    },
                    mask: layer.mask ? {
                        enabled: layer.mask.enabled,
                        operations: layer.mask.operations.slice(0, layer.mask.operationIndex).map(function (operation) {
                            return cacheOperations ? getCachedOperationSnapshot(operation, getLayerMaskOperationState) : getLayerMaskOperationState(operation);
                        }),
                        canUndo: canUndoLayerMask(layer.id),
                        canRedo: canRedoLayerMask(layer.id)
                    } : null,
                    adjustments: layer.adjustments ? getLayerAdjustmentsState(layer.adjustments) : null,
                    liquify: layer.liquify ? {
                        enabled: layer.liquify.enabled,
                        operations: layer.liquify.operations.slice(0, layer.liquify.historyIndex).map(function (operation) {
                            return cacheOperations ? getCachedOperationSnapshot(operation, getLayerLiquifyOperationState) : getLayerLiquifyOperationState(operation);
                        }),
                        canUndo: canUndoLayerLiquify(layer.id),
                        canRedo: canRedoLayerLiquify(layer.id)
                    } : null,
                    paint: layer.paint ? {
                        enabled: layer.paint.enabled,
                        operations: layer.paint.operations.slice(0, layer.paint.historyIndex).map(function (operation) {
                            return cacheOperations ? getCachedOperationSnapshot(operation, getLayerPaintOperationState) : getLayerPaintOperationState(operation);
                        }),
                        canUndo: canUndoLayerPaint(layer.id),
                        canRedo: canRedoLayerPaint(layer.id)
                    } : null,
                    retouch: layer.retouch ? {
                        enabled: layer.retouch.enabled,
                        operations: layer.retouch.operations.slice(0, layer.retouch.historyIndex).map(function (operation) {
                            return cacheOperations ? getCachedOperationSnapshot(operation, getLayerRetouchOperationState) : getLayerRetouchOperationState(operation);
                        }),
                        canUndo: canUndoLayerRetouch(layer.id),
                        canRedo: canRedoLayerRetouch(layer.id)
                    } : null
                };
            }),
            selection: getSelectionState(selection),
            crop: getCropState(crop),
            straighten: straighten
        };
    }

    function getNotificationState() {
        const state = getStateSnapshot(getCachedDocumentSnapshot());
        lastNotificationState = {...state};
        return state;
    }

    /** @type {ImageTypes.ImageEngine["getState"]} */
    function getState() {
        return getStateSnapshot(getDocumentSnapshot());
    }

    /** @param {ImageInternal.DocumentSnapshot} document @returns {ImageTypes.ImageState} */
    function getStateSnapshot(document) {
        const naturalWidth = getNaturalWidth();
        const naturalHeight = getNaturalHeight();
        const viewportSize = getViewportSize();
        const fitScale = getFitScale(getCanvasWidth(), getCanvasHeight(), viewportSize);
        const fillScale = getFillScale(getCanvasWidth(), getCanvasHeight(), viewportSize);
        const minScale = getMinScale(fitScale);
        const maxScale = getMaxScale(fitScale);

        return {
            src: getSource(),
            loading: isLoading(),
            loaded: isLoaded(),
            error: hasError ? errorMessage : null,
            naturalWidth: naturalWidth,
            naturalHeight: naturalHeight,
            canvasWidth: document.canvasWidth,
            canvasHeight: document.canvasHeight,
            canvasBackground: document.canvasBackground,
            layers: document.layers,
            selection: document.selection,
            crop: document.crop,
            straighten: document.straighten,
            viewportWidth: roundTo(viewportSize.width, 1),
            viewportHeight: roundTo(viewportSize.height, 1),
            scale: roundTo(scale, 4),
            fitScale: roundTo(fitScale, 4),
            fillScale: roundTo(fillScale, 4),
            minScale: roundTo(minScale, 4),
            maxScale: roundTo(maxScale, 4),
            zoomPercent: Math.round(scale * 100),
            offsetX: roundTo(offsetX, 1),
            offsetY: roundTo(offsetY, 1),
            rotation: roundTo(rotation, 2),
            flipX: flipX,
            flipY: flipY,
            fitMode: getFitMode(),
            transform: getTransform(),
            isFitted: isFitted(),
            isActualSize: isActualSize(),
            isZoomed: isZoomed(),
            canUndo: canUndo(),
            canRedo: canRedo(),
            canZoomIn: scale < maxScale - 0.0001,
            canZoomOut: scale > minScale + 0.0001,
            canPan: canPan(getCanvasWidth(), getCanvasHeight(), viewportSize),
            isFullscreen: isFullscreenActive(),
            fullscreenSupported: isFullscreenSupported()
        };
    }

    // endregion

    // region ===== Canvas Controls ====================================================================================
    let canvasWidthState = canvasWidth || 0;
    let canvasHeightState = canvasHeight || 0;
    let canvasBackgroundState = canvasBackground;

    function getCanvasWidth() {
        return canvasWidthState;
    }

    function getCanvasHeight() {
        return canvasHeightState;
    }

    function getCanvasBackground() {
        return canvasBackgroundState;
    }

    /** @type {ImageTypes.ImageEngine["setCanvasSize"]} */
    function setCanvasSize(width, height) {
        if (destroyed) return false;

        const nextWidth = Number(width);
        const nextHeight = Number(height);

        if (!Number.isFinite(nextWidth) || nextWidth <= 0 || !Number.isFinite(nextHeight) || nextHeight <= 0) {
            throw new TypeError("createImage: canvas dimensions must be positive numbers.");
        }

        const canvasSizeChanged = canvasWidthState !== nextWidth || canvasHeightState !== nextHeight;
        if (!canvasSizeChanged) return true;

        recordHistory();

        canvasWidthState = nextWidth;
        canvasHeightState = nextHeight;
        refitIfFitted();
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine["resizeDocument"]} */
    function resizeDocument(width, height) {
        if (destroyed) return false;

        if (typeof width !== "number" || !Number.isFinite(width) || width <= 0 || typeof height !== "number" || !Number.isFinite(height) || height <= 0) {
            throw new TypeError("createImage: canvas dimensions must be positive numbers.");
        }

        const canvasWidth = getCanvasWidth();
        const canvasHeight = getCanvasHeight();
        if (!canvasWidth || !canvasHeight) return false;

        if (canvasWidth === width && canvasHeight === height) return true;

        const scaleX = width / canvasWidth;
        const scaleY = height / canvasHeight;

        if (!Number.isFinite(scaleX) || scaleX <= 0 || !Number.isFinite(scaleY) || scaleY <= 0) {
            throw new TypeError("createImage: document resize scales must be positive numbers.");
        }

        const next = getDocumentState();
        next.canvasWidth = width;
        next.canvasHeight = height;

        for (const layer of next.layers) {
            const transform = layer.transform;
            const quarterTurn = transform.rotation === 90 || transform.rotation === 270;
            const layerScaleX = quarterTurn ? scaleY : scaleX;
            const layerScaleY = quarterTurn ? scaleX : scaleY;

            if (scaleX !== scaleY && transform.rotation % 90 !== 0) {
                if (!transform.perspective) {
                    const source = layer.source;
                    if (typeof source === "string") return false;

                    let sourceWidth = "width" in source && typeof source.width === "number" ? source.width : NaN;
                    let sourceHeight = "height" in source && typeof source.height === "number" ? source.height : NaN;

                    if ("naturalWidth" in source) {
                        sourceWidth = source.naturalWidth;
                        sourceHeight = source.naturalHeight;
                    }

                    if (!Number.isFinite(sourceWidth) || sourceWidth <= 0 || !Number.isFinite(sourceHeight) || sourceHeight <= 0) return false;

                    transform.perspective = {
                        topLeft: {x: 0, y: 0},
                        topRight: {x: sourceWidth, y: 0},
                        bottomRight: {x: sourceWidth, y: sourceHeight},
                        bottomLeft: {x: 0, y: sourceHeight}
                    };
                }

                const radians = transform.rotation * Math.PI / 180;
                const cos = Math.cos(radians);
                const sin = Math.sin(radians);
                const signedScaleX = transform.flipX ? -transform.scaleX : transform.scaleX;
                const signedScaleY = transform.flipY ? -transform.scaleY : transform.scaleY;

                // Resize in canvas axes, then express the remaining shear in the existing local corners.
                for (const point of Object.values(transform.perspective)) {
                    const x = point.x * signedScaleX;
                    const y = point.y * signedScaleY;
                    const resizedX = (x * cos - y * sin) * scaleX;
                    const resizedY = (x * sin + y * cos) * scaleY;
                    point.x = (resizedX * cos + resizedY * sin) / (signedScaleX * layerScaleX);
                    point.y = (resizedY * cos - resizedX * sin) / (signedScaleY * layerScaleY);

                    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
                        throw new TypeError("createImage: layer perspective corners must contain finite coordinates.");
                    }
                }
            }

            transform.x *= scaleX;
            transform.y *= scaleY;
            transform.scaleX *= layerScaleX;
            transform.scaleY *= layerScaleY;

            if (!Number.isFinite(transform.x) || !Number.isFinite(transform.y)) {
                throw new TypeError("createImage: layer coordinates must be finite numbers.");
            }

            if (!Number.isFinite(transform.scaleX) || transform.scaleX <= 0 || !Number.isFinite(transform.scaleY) || transform.scaleY <= 0) {
                throw new TypeError("createImage: layer scales must be positive numbers.");
            }
        }

        if (next.crop) {
            next.crop.x *= scaleX;
            next.crop.y *= scaleY;
            next.crop.width *= scaleX;
            next.crop.height *= scaleY;

            if (!Number.isFinite(next.crop.x) || !Number.isFinite(next.crop.y)) {
                throw new TypeError("createImage: crop coordinates must be finite numbers.");
            }

            if (!Number.isFinite(next.crop.width) || next.crop.width <= 0 || !Number.isFinite(next.crop.height) || next.crop.height <= 0) {
                throw new TypeError("createImage: crop dimensions must be positive numbers.");
            }
        }

        next.selection = getResizedSelectionState(selection, scaleX, scaleY);

        recordHistory();

        restoreDocumentState(next);
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine["setCanvasBackground"]} */
    function setCanvasBackground(background) {
        if (destroyed) return false;

        if (typeof background !== "string") {
            throw new TypeError("createImage: canvas background must be a string.");
        }

        if (canvasBackgroundState === background) return true;

        recordHistory();

        canvasBackgroundState = background;
        markDocumentChanged();
        notify();
        return true;
    }

    // endregion

    // region ===== Layer Controls =====================================================================================
    /** @type {ImageInternal.LayerState[]} */
    const layers = [];
    let nextLayerId = 1;

    /** @type {ImageTypes.ImageEngine['addLayer']} */
    function addLayer(layer) {
        if (destroyed) return false;

        if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
            throw new TypeError("createImage: layer must be an object.");
        }

        while (layers.some(function (layer) {
            return layer.id === "layer-" + nextLayerId;
        })) {
            nextLayerId++;
        }

        const {
            source,
            sourceReference,
            name = "Layer " + nextLayerId,
            visible = true,
            opacity = 1
        } = layer;

        if (typeof source !== "string" && (!source || typeof source !== "object" || Array.isArray(source))) {
            throw new TypeError("createImage: layer source must be a string or an image object.");
        }

        if (typeof source !== "string" && ("videoWidth" in source || "displayWidth" in source)) {
            throw new TypeError("createImage: video elements and video frames are not supported.");
        }

        if (typeof source !== "string" && "namespaceURI" in source && source.namespaceURI === "http://www.w3.org/2000/svg" && source.localName === "image") {
            throw new TypeError("createImage: SVG <image> layer sources are unsupported; load the SVG through an HTML <img> instead.");
        }

        if (sourceReference !== undefined && typeof sourceReference !== "string") {
            throw new TypeError("createImage: layer source reference must be a string when provided.");
        }

        if (typeof name !== "string") {
            throw new TypeError("createImage: layer name must be a string.");
        }

        if (typeof visible !== "boolean") {
            throw new TypeError("createImage: layer visibility must be a boolean.");
        }

        if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
            throw new TypeError("createImage: layer opacity must be a number between 0 and 1.");
        }

        recordHistory();

        const id = "layer-" + nextLayerId++;

        layers.push({
            id: id,
            source: source,
            sourceReference: sourceReference !== undefined ? sourceReference : typeof source === "string" ? source : null,
            name: name,
            visible: visible,
            opacity: opacity,
            transform: {
                x: 0,
                y: 0,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                flipX: false,
                flipY: false,
                perspective: null
            },
            mask: null,
            adjustments: null,
            liquify: null,
            paint: null,
            retouch: null
        });
        markDocumentChanged();
        notify();
        return id;
    }

    /** @type {ImageTypes.ImageEngine['resolveLayerSource']} */
    function resolveLayerSource(id, source) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || typeof layer.source !== "string") return false;

        if (!source || typeof source !== "object" || Array.isArray(source)) {
            throw new TypeError("createImage: layer source must be a drawable image object.");
        }

        if ("videoWidth" in source || "displayWidth" in source) {
            throw new TypeError("createImage: video elements and video frames are not supported.");
        }

        if ("namespaceURI" in source && source.namespaceURI === "http://www.w3.org/2000/svg" && source.localName === "image") {
            throw new TypeError("createImage: SVG <image> layer sources are unsupported; load the SVG through an HTML <img> instead.");
        }

        if ("naturalWidth" in source && (!source.complete || !source.naturalWidth || !source.naturalHeight)) {
            throw new TypeError("createImage: layer source must be a drawable image object.");
        }

        const target = ownerDocument.createElement("canvas");
        target.width = 1;
        target.height = 1;

        try {
            const context = target.getContext("2d");
            if (!context) return false;

            context.drawImage(source, 0, 0, 1, 1);
        } catch {
            throw new TypeError("createImage: layer source must be a drawable image object.");
        } finally {
            target.width = 0;
            target.height = 0;
        }

        // Resolving the same asset is a runtime change, including snapshots taken before it was available.
        for (const stack of [undoStack, redoStack, transactionState ? [transactionState] : []]) {
            for (const state of stack) {
                for (const previous of state.layers) {
                    if (previous.id === id && previous.source === layer.source && previous.sourceReference === layer.sourceReference) previous.source = source;
                }
            }
        }

        clearLayerProxy(id);
        layer.source = source;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['removeLayer']} */
    function removeLayer(id) {
        if (destroyed) return false;

        const index = layers.findIndex(function (layer) {
            return layer.id === id;
        });
        if (index === -1) return false;

        recordHistory();

        clearLayerProxy(id);
        layers.splice(index, 1);
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['rasterizeLayer']} */
    function rasterizeLayer(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer) return false;

        if (typeof layer.source === "string") return false;
        if ("naturalWidth" in layer.source && (!layer.source.complete || !layer.source.naturalWidth || !layer.source.naturalHeight)) return false;

        let target = null;
        let sourceReference = null;

        try {
            const source = renderLayerSource(layer);
            if (!source) return false;

            let width = "width" in source && typeof source.width === "number" ? source.width : 0;
            let height = "height" in source && typeof source.height === "number" ? source.height : 0;

            if ("naturalWidth" in source) {
                width = source.naturalWidth;
                height = source.naturalHeight;
            }

            if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return false;

            target = ownerDocument.createElement("canvas");
            target.width = width;
            target.height = height;

            const context = target.getContext("2d");
            if (!context) return false;

            context.drawImage(source, 0, 0);

            const encodedSource = target.toDataURL("image/png");
            const prefix = "data:image/png;base64,";
            if (!encodedSource.startsWith(prefix) || encodedSource.length === prefix.length) return false;

            sourceReference = encodedSource;
        } catch {
            return false;
        } finally {
            if (target && sourceReference === null) {
                target.width = 0;
                target.height = 0;
            }
        }

        recordHistory();

        clearLayerProxy(id);
        layer.source = target;
        layer.sourceReference = sourceReference;
        layer.adjustments = null;
        layer.liquify = null;
        layer.paint = null;
        layer.retouch = null;
        layer.mask = null;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['setLayerVisibility']} */
    function setLayerVisibility(id, visible) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer) return false;

        if (typeof visible !== "boolean") {
            throw new TypeError("createImage: layer visibility must be a boolean.");
        }

        if (layer.visible === visible) return true;

        recordHistory();

        layer.visible = visible;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['setLayerOpacity']} */
    function setLayerOpacity(id, opacity) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer) return false;

        if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
            throw new TypeError("createImage: layer opacity must be a number between 0 and 1.");
        }

        if (layer.opacity === opacity) return true;

        recordHistory();

        layer.opacity = opacity;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['setLayerTransform']} */
    function setLayerTransform(id, transform) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer) return false;

        if (!transform || typeof transform !== "object" || Array.isArray(transform)) {
            throw new TypeError("createImage: layer transform must be an object.");
        }

        for (const key of Reflect.ownKeys(transform)) {
            if (typeof key !== "string" || !["x", "y", "scaleX", "scaleY", "rotation", "flipX", "flipY", "perspective"].includes(key)) {
                throw new TypeError("createImage: layer transform contains an unknown property.");
            }
        }

        const {
            x = layer.transform.x,
            y = layer.transform.y,
            scaleX = layer.transform.scaleX,
            scaleY = layer.transform.scaleY,
            rotation = layer.transform.rotation,
            flipX = layer.transform.flipX,
            flipY = layer.transform.flipY,
            perspective = layer.transform.perspective
        } = transform;

        if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) {
            throw new TypeError("createImage: layer coordinates must be finite numbers.");
        }

        if (typeof scaleX !== "number" || !Number.isFinite(scaleX) || scaleX <= 0 || typeof scaleY !== "number" || !Number.isFinite(scaleY) || scaleY <= 0) {
            throw new TypeError("createImage: layer scales must be positive numbers.");
        }

        if (typeof rotation !== "number" || !Number.isFinite(rotation)) {
            throw new TypeError("createImage: layer rotation must be a finite number of degrees.");
        }

        if (typeof flipX !== "boolean" || typeof flipY !== "boolean") {
            throw new TypeError("createImage: layer flips must be booleans.");
        }

        if (perspective !== null) {
            if (!perspective || typeof perspective !== "object" || Array.isArray(perspective)) {
                throw new TypeError("createImage: layer perspective must be an object or null.");
            }

            for (const name of /** @type {const} */ (["topLeft", "topRight", "bottomRight", "bottomLeft"])) {
                const point = perspective[name];
                if (!point || typeof point !== "object" || Array.isArray(point) || typeof point.x !== "number" || !Number.isFinite(point.x) || typeof point.y !== "number" || !Number.isFinite(point.y)) {
                    throw new TypeError("createImage: layer perspective corners must contain finite coordinates.");
                }
            }
        }

        const next = {
            x: x,
            y: y,
            scaleX: scaleX,
            scaleY: scaleY,
            rotation: ((rotation % 360) + 360) % 360,
            flipX: flipX,
            flipY: flipY,
            perspective: getLayerPerspectiveState(perspective)
        };

        if (isLayerTransformEqual(layer.transform, next)) return true;

        recordHistory();

        layer.transform = next;
        markDocumentChanged();
        notify();
        return true;
    }

    /**
     * @param {ImageTypes.ImageLayerTransform} transform
     * @param {ImageTypes.ImageLayerTransform} previous
     * @returns {boolean}
     */
    function isLayerTransformEqual(transform, previous) {
        return transform.x === previous.x && transform.y === previous.y && transform.scaleX === previous.scaleX && transform.scaleY === previous.scaleY && transform.rotation === previous.rotation && transform.flipX === previous.flipX && transform.flipY === previous.flipY && isLayerPerspectiveEqual(transform.perspective, previous.perspective);
    }

    /** @type {ImageTypes.ImageEngine['resizeLayer']} */
    function resizeLayer(id, width, height, preserveAspectRatio = false) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer) return false;

        if (typeof width !== "number" || !Number.isFinite(width) || width <= 0 || typeof height !== "number" || !Number.isFinite(height) || height <= 0) {
            throw new TypeError("createImage: layer dimensions must be positive numbers.");
        }

        if (typeof preserveAspectRatio !== "boolean") {
            throw new TypeError("createImage: preserveAspectRatio must be a boolean.");
        }

        const source = layer.source;
        if (typeof source === "string") return false;

        let sourceWidth = "width" in source && typeof source.width === "number" ? source.width : 0;
        let sourceHeight = "height" in source && typeof source.height === "number" ? source.height : 0;

        if ("naturalWidth" in source) {
            sourceWidth = source.naturalWidth;
            sourceHeight = source.naturalHeight;
        }

        if (!Number.isFinite(sourceWidth) || sourceWidth <= 0 || !Number.isFinite(sourceHeight) || sourceHeight <= 0) return false;

        const scaleX = width / sourceWidth;
        const scaleY = height / sourceHeight;

        return setLayerTransform(id, {
            scaleX: preserveAspectRatio ? Math.min(scaleX, scaleY) : scaleX,
            scaleY: preserveAspectRatio ? Math.min(scaleX, scaleY) : scaleY
        });
    }

    /** @type {ImageTypes.ImageEngine['setLayerPerspective']} */
    function setLayerPerspective(id, perspective) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer) return false;

        if (!perspective || typeof perspective !== "object" || Array.isArray(perspective)) {
            throw new TypeError("createImage: layer perspective must be an object.");
        }

        for (const name of /** @type {const} */ (["topLeft", "topRight", "bottomRight", "bottomLeft"])) {
            const point = perspective[name];
            if (!point || typeof point !== "object" || Array.isArray(point) || typeof point.x !== "number" || !Number.isFinite(point.x) || typeof point.y !== "number" || !Number.isFinite(point.y)) {
                throw new TypeError("createImage: layer perspective corners must contain finite coordinates.");
            }
        }

        if (isLayerPerspectiveEqual(perspective, layer.transform.perspective)) return true;

        recordHistory();

        layer.transform.perspective = getLayerPerspectiveState(perspective);
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['clearLayerPerspective']} */
    function clearLayerPerspective(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || !layer.transform.perspective) return false;

        recordHistory();

        layer.transform.perspective = null;
        markDocumentChanged();
        notify();
        return true;
    }

    /**
     * @param {ImageTypes.ImageLayerPerspective | null | undefined} perspective
     * @returns {ImageTypes.ImageLayerPerspective | null}
     */
    function getLayerPerspectiveState(perspective) {
        if (!perspective) return null;

        return {
            topLeft: {x: perspective.topLeft.x, y: perspective.topLeft.y},
            topRight: {x: perspective.topRight.x, y: perspective.topRight.y},
            bottomRight: {x: perspective.bottomRight.x, y: perspective.bottomRight.y},
            bottomLeft: {x: perspective.bottomLeft.x, y: perspective.bottomLeft.y}
        };
    }

    /**
     * @param {ImageTypes.ImageLayerPerspective | null | undefined} perspective
     * @param {ImageTypes.ImageLayerPerspective | null | undefined} previous
     * @returns {boolean}
     */
    function isLayerPerspectiveEqual(perspective, previous) {
        if (!perspective || !previous) return perspective === previous;

        return /** @type {const} */ (["topLeft", "topRight", "bottomRight", "bottomLeft"]).every(function (name) {
            return perspective[name].x === previous[name].x && perspective[name].y === previous[name].y;
        });
    }

    /** @type {ImageTypes.ImageEngine['createLayerMask']} */
    function createLayerMask(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || layer.mask) return false;

        recordHistory();

        layer.mask = {
            enabled: true,
            operations: [],
            operationIndex: 0
        };
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['removeLayerMask']} */
    function removeLayerMask(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || !layer.mask) return false;

        recordHistory();

        layer.mask = null;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['setLayerMaskEnabled']} */
    function setLayerMaskEnabled(id, enabled) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || !layer.mask) return false;

        if (typeof enabled !== "boolean") {
            throw new TypeError("createImage: layer mask enabled must be a boolean.");
        }

        if (layer.mask.enabled === enabled) return true;

        recordHistory();

        layer.mask.enabled = enabled;
        markDocumentChanged();
        notify();
        return true;
    }

    /**
     * @param {ImageTypes.ImageSerializedLayerMask | null} mask
     * @param {ImageTypes.ImageSerializedLayerMask | null} previous
     * @param {boolean} activeOnly
     * @returns {boolean}
     */
    function isLayerMaskEqual(mask, previous, activeOnly = false) {
        if (!mask || !previous) return mask === previous;

        return mask.enabled === previous.enabled && mask.operationIndex === previous.operationIndex && (activeOnly ? (mask.operationIndex < mask.operations.length) === (previous.operationIndex < previous.operations.length) : mask.operations.length === previous.operations.length) && mask.operations.every(function (operation, index) {
            return (activeOnly && index >= mask.operationIndex) || operation === previous.operations[index] || isLayerMaskOperationEqual(operation, previous.operations[index]);
        });
    }

    /** @type {ImageTypes.ImageEngine['addLayerMaskOperation']} */
    function addLayerMaskOperation(id, operation) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || !layer.mask) return false;

        if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
            throw new TypeError("createImage: layer mask operation must be an object.");
        }

        const {type, points, size, hardness, opacity} = operation;

        if (!["erase", "restore"].includes(type)) {
            throw new TypeError("createImage: layer mask operation type must be 'erase' or 'restore'.");
        }

        if (!Array.isArray(points) || !points.length) {
            throw new TypeError("createImage: layer mask operation points must be a non-empty array.");
        }

        for (const point of points) {
            if (!point || typeof point !== "object" || Array.isArray(point) || typeof point.x !== "number" || !Number.isFinite(point.x) || typeof point.y !== "number" || !Number.isFinite(point.y)) {
                throw new TypeError("createImage: layer mask operation points must contain finite coordinates.");
            }
        }

        if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
            throw new TypeError("createImage: layer mask operation size must be a positive number.");
        }

        if (typeof hardness !== "number" || !Number.isFinite(hardness) || hardness < 0 || hardness > 1) {
            throw new TypeError("createImage: layer mask operation hardness must be a number between 0 and 1.");
        }

        if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
            throw new TypeError("createImage: layer mask operation opacity must be a number between 0 and 1.");
        }

        const next = {
            type: type,
            points: points.map(function (point) {
                return {x: point.x, y: point.y};
            }),
            size: size,
            hardness: hardness,
            opacity: opacity,
            selection: getOperationSelectionState(id, operation.selection)
        };
        if (next.selection === false) return false;

        layer.mask.operations = layer.mask.operations.slice(0, layer.mask.operationIndex).concat(/** @type {ImageTypes.ImageLayerMaskOperation} */ (next));
        layer.mask.operationIndex = layer.mask.operations.length;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['undoLayerMask']} */
    function undoLayerMask(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || !layer.mask || !layer.mask.operationIndex) return false;

        layer.mask.operationIndex--;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['redoLayerMask']} */
    function redoLayerMask(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || !layer.mask || layer.mask.operationIndex === layer.mask.operations.length) return false;

        layer.mask.operationIndex++;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['canUndoLayerMask']} */
    function canUndoLayerMask(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });

        return Boolean(layer && layer.mask && layer.mask.operationIndex > 0);
    }

    /** @type {ImageTypes.ImageEngine['canRedoLayerMask']} */
    function canRedoLayerMask(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });

        return Boolean(layer && layer.mask && layer.mask.operationIndex < layer.mask.operations.length);
    }

    /**
     * @param {ImageTypes.ImageLayerMaskOperation} operation
     * @returns {ImageTypes.ImageLayerMaskOperation}
     */
    function getLayerMaskOperationState(operation) {
        return {
            type: operation.type,
            points: operation.points.map(function (point) {
                return {x: point.x, y: point.y};
            }),
            size: operation.size,
            hardness: operation.hardness,
            opacity: operation.opacity,
            selection: getSelectionState(operation.selection)
        };
    }

    /**
     * @param {ImageTypes.ImageLayerMaskOperation} operation
     * @param {ImageTypes.ImageLayerMaskOperation} previous
     * @returns {boolean}
     */
    function isLayerMaskOperationEqual(operation, previous) {
        if (!isSelectionEqual(operation.selection, previous.selection)) return false;

        return operation.type === previous.type && operation.size === previous.size && operation.hardness === previous.hardness && operation.opacity === previous.opacity && operation.points.length === previous.points.length && operation.points.every(function (point, index) {
            return point.x === previous.points[index].x && point.y === previous.points[index].y;
        });
    }

    /** @type {ImageTypes.ImageEngine['createLayerAdjustments']} */
    function createLayerAdjustments(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || layer.adjustments) return false;

        recordHistory();

        layer.adjustments = {
            enabled: true,
            values: {
                exposure: 0,
                brightness: 0,
                contrast: 0,
                highlights: 0,
                shadows: 0,
                temperature: 0,
                tint: 0,
                saturation: 0,
                vibrance: 0,
                clarity: 0,
                sharpness: 0
            }
        };
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['removeLayerAdjustments']} */
    function removeLayerAdjustments(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || !layer.adjustments) return false;

        recordHistory();

        layer.adjustments = null;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['setLayerAdjustment']} */
    function setLayerAdjustment(id, name, value) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer) return false;

        if (!["exposure", "brightness", "contrast", "highlights", "shadows", "temperature", "tint", "saturation", "vibrance", "clarity", "sharpness"].includes(name)) {
            throw new TypeError("createImage: layer adjustment name is not supported.");
        }

        if (typeof value !== "number" || !Number.isFinite(value)) {
            throw new TypeError("createImage: layer adjustment value must be a finite number.");
        }

        if (layer.adjustments && layer.adjustments.values[name] === value) return true;

        recordHistory();

        if (!layer.adjustments) {
            layer.adjustments = {
                enabled: true,
                values: {
                    exposure: 0,
                    brightness: 0,
                    contrast: 0,
                    highlights: 0,
                    shadows: 0,
                    temperature: 0,
                    tint: 0,
                    saturation: 0,
                    vibrance: 0,
                    clarity: 0,
                    sharpness: 0
                }
            };
        }

        layer.adjustments.values[name] = value;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['setLayerAdjustmentsEnabled']} */
    function setLayerAdjustmentsEnabled(id, enabled) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || !layer.adjustments) return false;

        if (typeof enabled !== "boolean") {
            throw new TypeError("createImage: layer adjustments enabled must be a boolean.");
        }

        if (layer.adjustments.enabled === enabled) return true;

        recordHistory();

        layer.adjustments.enabled = enabled;
        markDocumentChanged();
        notify();
        return true;
    }

    /**
     * @param {ImageTypes.ImageLayerAdjustments} adjustments
     * @returns {ImageTypes.ImageLayerAdjustments}
     */
    function getLayerAdjustmentsState(adjustments) {
        return {
            enabled: adjustments.enabled,
            values: {
                exposure: adjustments.values.exposure,
                brightness: adjustments.values.brightness,
                contrast: adjustments.values.contrast,
                highlights: adjustments.values.highlights,
                shadows: adjustments.values.shadows,
                temperature: adjustments.values.temperature,
                tint: adjustments.values.tint,
                saturation: adjustments.values.saturation,
                vibrance: adjustments.values.vibrance,
                clarity: adjustments.values.clarity,
                sharpness: adjustments.values.sharpness
            }
        };
    }

    /**
     * @param {ImageTypes.ImageLayerAdjustments | null} adjustments
     * @param {ImageTypes.ImageLayerAdjustments | null} previous
     * @returns {boolean}
     */
    function isLayerAdjustmentsEqual(adjustments, previous) {
        if (!adjustments || !previous) return adjustments === previous;

        return adjustments.enabled === previous.enabled && /** @type {(keyof ImageTypes.ImageLayerAdjustmentValues)[]} */ (Object.keys(adjustments.values)).every(function (name) {
            return adjustments.values[name] === previous.values[name];
        });
    }

    /** @type {ImageTypes.ImageEngine['createLayerLiquify']} */
    function createLayerLiquify(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || layer.liquify) return false;

        recordHistory();

        layer.liquify = {
            enabled: true,
            operations: [],
            historyIndex: 0
        };
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['removeLayerLiquify']} */
    function removeLayerLiquify(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || !layer.liquify) return false;

        recordHistory();

        layer.liquify = null;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['setLayerLiquifyEnabled']} */
    function setLayerLiquifyEnabled(id, enabled) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || !layer.liquify) return false;

        if (typeof enabled !== "boolean") {
            throw new TypeError("createImage: layer liquify enabled must be a boolean.");
        }

        if (layer.liquify.enabled === enabled) return true;

        recordHistory();

        layer.liquify.enabled = enabled;
        markDocumentChanged();
        notify();
        return true;
    }

    /**
     * @param {ImageTypes.ImageSerializedLayerLiquify | null} liquify
     * @param {ImageTypes.ImageSerializedLayerLiquify | null} previous
     * @param {boolean} activeOnly
     * @returns {boolean}
     */
    function isLayerLiquifyEqual(liquify, previous, activeOnly = false) {
        if (!liquify || !previous) return liquify === previous;

        return liquify.enabled === previous.enabled && liquify.historyIndex === previous.historyIndex && (activeOnly ? (liquify.historyIndex < liquify.operations.length) === (previous.historyIndex < previous.operations.length) : liquify.operations.length === previous.operations.length) && liquify.operations.every(function (operation, index) {
            return (activeOnly && index >= liquify.historyIndex) || operation === previous.operations[index] || isLayerLiquifyOperationEqual(operation, previous.operations[index]);
        });
    }

    /** @type {ImageTypes.ImageEngine['addLayerLiquifyOperation']} */
    function addLayerLiquifyOperation(id, operation) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer) return false;

        if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
            throw new TypeError("createImage: layer liquify operation must be an object.");
        }

        const {type, points, size, strength, density, rate} = operation;

        if (!["push", "restore", "shrink", "bloat", "twirl"].includes(type)) {
            throw new TypeError("createImage: layer liquify operation type must be 'push', 'restore', 'shrink', 'bloat', or 'twirl'.");
        }

        if (!Array.isArray(points) || !points.length) {
            throw new TypeError("createImage: layer liquify operation points must be a non-empty array.");
        }

        for (const point of points) {
            if (!point || typeof point !== "object" || Array.isArray(point) || typeof point.x !== "number" || !Number.isFinite(point.x) || typeof point.y !== "number" || !Number.isFinite(point.y)) {
                throw new TypeError("createImage: layer liquify operation points must contain finite coordinates.");
            }
        }

        if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
            throw new TypeError("createImage: layer liquify operation size must be a positive number.");
        }

        if (typeof strength !== "number" || !Number.isFinite(strength)) {
            throw new TypeError("createImage: layer liquify operation strength must be a finite number.");
        }

        if (typeof density !== "number" || !Number.isFinite(density)) {
            throw new TypeError("createImage: layer liquify operation density must be a finite number.");
        }

        if (typeof rate !== "number" || !Number.isFinite(rate)) {
            throw new TypeError("createImage: layer liquify operation rate must be a finite number.");
        }

        const next = {
            type: type,
            points: points.map(function (point) {
                return {x: point.x, y: point.y};
            }),
            size: size,
            strength: strength,
            density: density,
            rate: rate,
            selection: getOperationSelectionState(id, operation.selection)
        };
        if (next.selection === false) return false;

        if (!layer.liquify) {
            layer.liquify = {
                enabled: true,
                operations: [],
                historyIndex: 0
            };
        }

        layer.liquify.operations = layer.liquify.operations.slice(0, layer.liquify.historyIndex).concat(/** @type {ImageTypes.ImageLayerLiquifyOperation} */ (next));
        layer.liquify.historyIndex = layer.liquify.operations.length;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['undoLayerLiquify']} */
    function undoLayerLiquify(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || !layer.liquify || !layer.liquify.historyIndex) return false;

        layer.liquify.historyIndex--;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['redoLayerLiquify']} */
    function redoLayerLiquify(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || !layer.liquify || layer.liquify.historyIndex === layer.liquify.operations.length) return false;

        layer.liquify.historyIndex++;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['canUndoLayerLiquify']} */
    function canUndoLayerLiquify(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });

        return Boolean(layer && layer.liquify && layer.liquify.historyIndex > 0);
    }

    /** @type {ImageTypes.ImageEngine['canRedoLayerLiquify']} */
    function canRedoLayerLiquify(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });

        return Boolean(layer && layer.liquify && layer.liquify.historyIndex < layer.liquify.operations.length);
    }

    /**
     * @param {ImageTypes.ImageLayerLiquifyOperation} operation
     * @returns {ImageTypes.ImageLayerLiquifyOperation}
     */
    function getLayerLiquifyOperationState(operation) {
        return {
            type: operation.type,
            points: operation.points.map(function (point) {
                return {x: point.x, y: point.y};
            }),
            size: operation.size,
            strength: operation.strength,
            density: operation.density,
            rate: operation.rate,
            selection: getSelectionState(operation.selection)
        };
    }

    /**
     * @param {ImageTypes.ImageLayerLiquifyOperation} operation
     * @param {ImageTypes.ImageLayerLiquifyOperation} previous
     * @returns {boolean}
     */
    function isLayerLiquifyOperationEqual(operation, previous) {
        if (!isSelectionEqual(operation.selection, previous.selection)) return false;

        return operation.type === previous.type && operation.size === previous.size && operation.strength === previous.strength && operation.density === previous.density && operation.rate === previous.rate && operation.points.length === previous.points.length && operation.points.every(function (point, index) {
            return point.x === previous.points[index].x && point.y === previous.points[index].y;
        });
    }

    /** @type {ImageTypes.ImageEngine['createLayerPaint']} */
    function createLayerPaint(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || layer.paint) return false;

        recordHistory();

        layer.paint = {
            enabled: true,
            operations: [],
            historyIndex: 0
        };
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['removeLayerPaint']} */
    function removeLayerPaint(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || !layer.paint) return false;

        recordHistory();

        layer.paint = null;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['setLayerPaintEnabled']} */
    function setLayerPaintEnabled(id, enabled) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || !layer.paint) return false;

        if (typeof enabled !== "boolean") {
            throw new TypeError("createImage: layer paint enabled must be a boolean.");
        }

        if (layer.paint.enabled === enabled) return true;

        recordHistory();

        layer.paint.enabled = enabled;
        markDocumentChanged();
        notify();
        return true;
    }

    /**
     * @param {ImageTypes.ImageSerializedLayerPaint | null} paint
     * @param {ImageTypes.ImageSerializedLayerPaint | null} previous
     * @param {boolean} activeOnly
     * @returns {boolean}
     */
    function isLayerPaintEqual(paint, previous, activeOnly = false) {
        if (!paint || !previous) return paint === previous;

        return paint.enabled === previous.enabled && paint.historyIndex === previous.historyIndex && (activeOnly ? (paint.historyIndex < paint.operations.length) === (previous.historyIndex < previous.operations.length) : paint.operations.length === previous.operations.length) && paint.operations.every(function (operation, index) {
            return (activeOnly && index >= paint.historyIndex) || operation === previous.operations[index] || isLayerPaintOperationEqual(operation, previous.operations[index]);
        });
    }

    /** @type {ImageTypes.ImageEngine['addLayerPaintOperation']} */
    function addLayerPaintOperation(id, operation) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer) return false;

        if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
            throw new TypeError("createImage: layer paint operation must be an object.");
        }

        const {type} = operation;

        if (!["brush", "pencil", "fill", "gradient"].includes(type)) {
            throw new TypeError("createImage: layer paint operation type must be 'brush', 'pencil', 'fill', or 'gradient'.");
        }

        /** @type {ImageTypes.ImageLayerPaintOperation | null} */
        let next = null;

        if (type === "brush") {
            const {points, size, hardness, opacity, color} = operation;

            if (!Array.isArray(points) || !points.length) {
                throw new TypeError("createImage: layer paint operation points must be a non-empty array.");
            }

            for (const point of points) {
                if (!point || typeof point !== "object" || Array.isArray(point) || typeof point.x !== "number" || !Number.isFinite(point.x) || typeof point.y !== "number" || !Number.isFinite(point.y)) {
                    throw new TypeError("createImage: layer paint operation points must contain finite coordinates.");
                }
            }

            if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
                throw new TypeError("createImage: layer paint operation size must be a positive number.");
            }

            if (typeof hardness !== "number" || !Number.isFinite(hardness) || hardness < 0 || hardness > 1) {
                throw new TypeError("createImage: layer paint operation hardness must be a number between 0 and 1.");
            }

            if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
                throw new TypeError("createImage: layer paint operation opacity must be a number between 0 and 1.");
            }

            if (typeof color !== "string") {
                throw new TypeError("createImage: layer paint operation color must be a string.");
            }

            next = {
                type: type,
                points: points.map(function (point) {
                    return {x: point.x, y: point.y};
                }),
                size: size,
                hardness: hardness,
                opacity: opacity,
                color: color
            };
        } else if (type === "pencil") {
            const {points, size, opacity, color} = operation;

            if (!Array.isArray(points) || !points.length) {
                throw new TypeError("createImage: layer paint operation points must be a non-empty array.");
            }

            for (const point of points) {
                if (!point || typeof point !== "object" || Array.isArray(point) || typeof point.x !== "number" || !Number.isFinite(point.x) || typeof point.y !== "number" || !Number.isFinite(point.y)) {
                    throw new TypeError("createImage: layer paint operation points must contain finite coordinates.");
                }
            }

            if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
                throw new TypeError("createImage: layer paint operation size must be a positive number.");
            }

            if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
                throw new TypeError("createImage: layer paint operation opacity must be a number between 0 and 1.");
            }

            if (typeof color !== "string") {
                throw new TypeError("createImage: layer paint operation color must be a string.");
            }

            next = {
                type: type,
                points: points.map(function (point) {
                    return {x: point.x, y: point.y};
                }),
                size: size,
                opacity: opacity,
                color: color
            };
        } else if (type === "fill") {
            const {x, y, color, opacity, tolerance} = operation;

            if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) {
                throw new TypeError("createImage: layer paint fill coordinates must be finite numbers.");
            }

            if (typeof color !== "string") {
                throw new TypeError("createImage: layer paint operation color must be a string.");
            }

            if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
                throw new TypeError("createImage: layer paint operation opacity must be a number between 0 and 1.");
            }

            if (typeof tolerance !== "number" || !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1) {
                throw new TypeError("createImage: layer paint fill tolerance must be a number between 0 and 1.");
            }

            next = {
                type: type,
                x: x,
                y: y,
                color: color,
                opacity: opacity,
                tolerance: tolerance
            };
        } else {
            const {startX, startY, endX, endY, startColor, endColor, opacity} = operation;

            if (typeof startX !== "number" || !Number.isFinite(startX) || typeof startY !== "number" || !Number.isFinite(startY) || typeof endX !== "number" || !Number.isFinite(endX) || typeof endY !== "number" || !Number.isFinite(endY)) {
                throw new TypeError("createImage: layer paint gradient coordinates must be finite numbers.");
            }

            if (startX === endX && startY === endY) {
                throw new TypeError("createImage: layer paint gradient start and end positions must be different.");
            }

            if (typeof startColor !== "string" || typeof endColor !== "string") {
                throw new TypeError("createImage: layer paint gradient colors must be strings.");
            }

            if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
                throw new TypeError("createImage: layer paint operation opacity must be a number between 0 and 1.");
            }

            next = {
                type: type,
                startX: startX,
                startY: startY,
                endX: endX,
                endY: endY,
                startColor: startColor,
                endColor: endColor,
                opacity: opacity
            };
        }

        const operationSelection = getOperationSelectionState(id, operation.selection);
        if (operationSelection === false) return false;
        next.selection = operationSelection;

        if (!layer.paint) {
            layer.paint = {
                enabled: true,
                operations: [],
                historyIndex: 0
            };
        }

        layer.paint.operations = layer.paint.operations.slice(0, layer.paint.historyIndex).concat(next);
        layer.paint.historyIndex = layer.paint.operations.length;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['undoLayerPaint']} */
    function undoLayerPaint(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || !layer.paint || !layer.paint.historyIndex) return false;

        layer.paint.historyIndex--;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['redoLayerPaint']} */
    function redoLayerPaint(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || !layer.paint || layer.paint.historyIndex === layer.paint.operations.length) return false;

        layer.paint.historyIndex++;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['canUndoLayerPaint']} */
    function canUndoLayerPaint(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });

        return Boolean(layer && layer.paint && layer.paint.historyIndex > 0);
    }

    /** @type {ImageTypes.ImageEngine['canRedoLayerPaint']} */
    function canRedoLayerPaint(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });

        return Boolean(layer && layer.paint && layer.paint.historyIndex < layer.paint.operations.length);
    }

    /**
     * @param {ImageTypes.ImageLayerPaintOperation} operation
     * @returns {ImageTypes.ImageLayerPaintOperation}
     */
    function getLayerPaintOperationState(operation) {
        if (operation.type === "pencil") {
            return {
                type: operation.type,
                points: operation.points.map(function (point) {
                    return {x: point.x, y: point.y};
                }),
                size: operation.size,
                opacity: operation.opacity,
                color: operation.color,
                selection: getSelectionState(operation.selection)
            };
        }

        if (operation.type === "fill") {
            return {
                type: operation.type,
                x: operation.x,
                y: operation.y,
                color: operation.color,
                opacity: operation.opacity,
                tolerance: operation.tolerance,
                selection: getSelectionState(operation.selection)
            };
        }

        if (operation.type === "gradient") {
            return {
                type: operation.type,
                startX: operation.startX,
                startY: operation.startY,
                endX: operation.endX,
                endY: operation.endY,
                startColor: operation.startColor,
                endColor: operation.endColor,
                opacity: operation.opacity,
                selection: getSelectionState(operation.selection)
            };
        }

        return {
            type: operation.type,
            points: operation.points.map(function (point) {
                return {x: point.x, y: point.y};
            }),
            size: operation.size,
            hardness: operation.hardness,
            opacity: operation.opacity,
            color: operation.color,
            selection: getSelectionState(operation.selection)
        };
    }

    /**
     * @param {ImageTypes.ImageLayerPaintOperation} operation
     * @param {ImageTypes.ImageLayerPaintOperation} previous
     * @returns {boolean}
     */
    function isLayerPaintOperationEqual(operation, previous) {
        if (!isSelectionEqual(operation.selection, previous.selection)) return false;

        if (operation.type === "pencil") {
            return operation.type === previous.type && operation.size === previous.size && operation.opacity === previous.opacity && operation.color === previous.color && operation.points.length === previous.points.length && operation.points.every(function (point, index) {
                return point.x === previous.points[index].x && point.y === previous.points[index].y;
            });
        }

        if (operation.type === "fill") {
            return operation.type === previous.type && operation.x === previous.x && operation.y === previous.y && operation.color === previous.color && operation.opacity === previous.opacity && operation.tolerance === previous.tolerance;
        }

        if (operation.type === "gradient") {
            return operation.type === previous.type && operation.startX === previous.startX && operation.startY === previous.startY && operation.endX === previous.endX && operation.endY === previous.endY && operation.startColor === previous.startColor && operation.endColor === previous.endColor && operation.opacity === previous.opacity;
        }

        return operation.type === previous.type && operation.size === previous.size && operation.hardness === previous.hardness && operation.opacity === previous.opacity && operation.color === previous.color && operation.points.length === previous.points.length && operation.points.every(function (point, index) {
            return point.x === previous.points[index].x && point.y === previous.points[index].y;
        });
    }

    /** @type {ImageTypes.ImageEngine['createLayerRetouch']} */
    function createLayerRetouch(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || layer.retouch) return false;

        recordHistory();

        layer.retouch = {
            enabled: true,
            operations: [],
            historyIndex: 0
        };
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['removeLayerRetouch']} */
    function removeLayerRetouch(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || !layer.retouch) return false;

        recordHistory();

        layer.retouch = null;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['setLayerRetouchEnabled']} */
    function setLayerRetouchEnabled(id, enabled) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || !layer.retouch) return false;

        if (typeof enabled !== "boolean") {
            throw new TypeError("createImage: layer retouch enabled must be a boolean.");
        }

        if (layer.retouch.enabled === enabled) return true;

        recordHistory();

        layer.retouch.enabled = enabled;
        markDocumentChanged();
        notify();
        return true;
    }

    /**
     * @param {ImageTypes.ImageSerializedLayerRetouch | null} retouch
     * @param {ImageTypes.ImageSerializedLayerRetouch | null} previous
     * @param {boolean} activeOnly
     * @returns {boolean}
     */
    function isLayerRetouchEqual(retouch, previous, activeOnly = false) {
        if (!retouch || !previous) return retouch === previous;

        return retouch.enabled === previous.enabled && retouch.historyIndex === previous.historyIndex && (activeOnly ? (retouch.historyIndex < retouch.operations.length) === (previous.historyIndex < previous.operations.length) : retouch.operations.length === previous.operations.length) && retouch.operations.every(function (operation, index) {
            return (activeOnly && index >= retouch.historyIndex) || operation === previous.operations[index] || isLayerRetouchOperationEqual(operation, previous.operations[index]);
        });
    }

    /** @type {ImageTypes.ImageEngine['addLayerRetouchOperation']} */
    function addLayerRetouchOperation(id, operation) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer) return false;

        if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
            throw new TypeError("createImage: layer retouch operation must be an object.");
        }

        const {type, sourceX, sourceY, points, size, hardness, opacity} = operation;

        if (!["clone", "heal"].includes(type)) {
            throw new TypeError("createImage: layer retouch operation type must be 'clone' or 'heal'.");
        }

        if (typeof sourceX !== "number" || !Number.isFinite(sourceX) || typeof sourceY !== "number" || !Number.isFinite(sourceY)) {
            throw new TypeError("createImage: layer retouch source coordinates must be finite numbers.");
        }

        if (!Array.isArray(points) || !points.length) {
            throw new TypeError("createImage: layer retouch operation points must be a non-empty array.");
        }

        for (const point of points) {
            if (!point || typeof point !== "object" || Array.isArray(point) || typeof point.x !== "number" || !Number.isFinite(point.x) || typeof point.y !== "number" || !Number.isFinite(point.y)) {
                throw new TypeError("createImage: layer retouch operation points must contain finite coordinates.");
            }
        }

        if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
            throw new TypeError("createImage: layer retouch operation size must be a positive number.");
        }

        if (typeof hardness !== "number" || !Number.isFinite(hardness) || hardness < 0 || hardness > 1) {
            throw new TypeError("createImage: layer retouch operation hardness must be a number between 0 and 1.");
        }

        if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
            throw new TypeError("createImage: layer retouch operation opacity must be a number between 0 and 1.");
        }

        const next = {
            type: type,
            sourceX: sourceX,
            sourceY: sourceY,
            points: points.map(function (point) {
                return {x: point.x, y: point.y};
            }),
            size: size,
            hardness: hardness,
            opacity: opacity,
            selection: getOperationSelectionState(id, operation.selection)
        };
        if (next.selection === false) return false;

        if (!layer.retouch) {
            layer.retouch = {
                enabled: true,
                operations: [],
                historyIndex: 0
            };
        }

        layer.retouch.operations = layer.retouch.operations.slice(0, layer.retouch.historyIndex).concat(/** @type {ImageTypes.ImageLayerRetouchOperation} */ (next));
        layer.retouch.historyIndex = layer.retouch.operations.length;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['undoLayerRetouch']} */
    function undoLayerRetouch(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || !layer.retouch || !layer.retouch.historyIndex) return false;

        layer.retouch.historyIndex--;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['redoLayerRetouch']} */
    function redoLayerRetouch(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer || !layer.retouch || layer.retouch.historyIndex === layer.retouch.operations.length) return false;

        layer.retouch.historyIndex++;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['canUndoLayerRetouch']} */
    function canUndoLayerRetouch(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });

        return Boolean(layer && layer.retouch && layer.retouch.historyIndex > 0);
    }

    /** @type {ImageTypes.ImageEngine['canRedoLayerRetouch']} */
    function canRedoLayerRetouch(id) {
        if (destroyed) return false;

        const layer = layers.find(function (layer) {
            return layer.id === id;
        });

        return Boolean(layer && layer.retouch && layer.retouch.historyIndex < layer.retouch.operations.length);
    }

    /**
     * @param {ImageTypes.ImageLayerRetouchOperation} operation
     * @returns {ImageTypes.ImageLayerRetouchOperation}
     */
    function getLayerRetouchOperationState(operation) {
        return {
            type: operation.type,
            sourceX: operation.sourceX,
            sourceY: operation.sourceY,
            points: operation.points.map(function (point) {
                return {x: point.x, y: point.y};
            }),
            size: operation.size,
            hardness: operation.hardness,
            opacity: operation.opacity,
            selection: getSelectionState(operation.selection)
        };
    }

    /**
     * @param {ImageTypes.ImageLayerRetouchOperation} operation
     * @param {ImageTypes.ImageLayerRetouchOperation} previous
     * @returns {boolean}
     */
    function isLayerRetouchOperationEqual(operation, previous) {
        if (!isSelectionEqual(operation.selection, previous.selection)) return false;

        return operation.type === previous.type && operation.sourceX === previous.sourceX && operation.sourceY === previous.sourceY && operation.size === previous.size && operation.hardness === previous.hardness && operation.opacity === previous.opacity && operation.points.length === previous.points.length && operation.points.every(function (point, index) {
            return point.x === previous.points[index].x && point.y === previous.points[index].y;
        });
    }

    /** @type {ImageTypes.ImageEngine['moveLayer']} */
    function moveLayer(id, index) {
        if (destroyed) return false;

        const currentIndex = layers.findIndex(function (layer) {
            return layer.id === id;
        });
        if (currentIndex === -1) return false;

        if (!Number.isInteger(index) || index < 0 || index >= layers.length) {
            throw new TypeError("createImage: layer index must be an integer within the layer stack.");
        }

        if (currentIndex === index) return true;

        recordHistory();

        const layer = layers.splice(currentIndex, 1)[0];
        layers.splice(index, 0, layer);
        markDocumentChanged();
        notify();
        return true;
    }

    // endregion

    // region ===== Selection Controls =================================================================================
    /** @type {ImageTypes.ImageSelection | null} */
    let selection = null;

    /** @type {ImageTypes.ImageEngine['setSelection']} */
    function setSelection(value) {
        if (destroyed) return false;

        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new TypeError("createImage: selection must be an object.");
        }

        const {type} = value;

        if (!["rectangle", "lasso"].includes(type)) {
            throw new TypeError("createImage: selection type must be 'rectangle' or 'lasso'.");
        }

        let next = null;

        if (type === "rectangle") {
            const {x, y, width, height} = value;

            if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) {
                throw new TypeError("createImage: selection coordinates must be finite numbers.");
            }

            if (typeof width !== "number" || !Number.isFinite(width) || width <= 0 || typeof height !== "number" || !Number.isFinite(height) || height <= 0) {
                throw new TypeError("createImage: selection dimensions must be positive numbers.");
            }

            next = {
                type: type,
                x: x,
                y: y,
                width: width,
                height: height
            };
        } else {
            const {points} = value;

            if (!Array.isArray(points) || !points.length) {
                throw new TypeError("createImage: selection points must be a non-empty array.");
            }

            for (const point of points) {
                if (!point || typeof point !== "object" || Array.isArray(point) || typeof point.x !== "number" || !Number.isFinite(point.x) || typeof point.y !== "number" || !Number.isFinite(point.y)) {
                    throw new TypeError("createImage: selection points must contain finite coordinates.");
                }
            }

            next = {
                type: type,
                points: points.map(function (point) {
                    return {x: point.x, y: point.y};
                })
            };
        }

        if (isSelectionEqual(next, selection)) return true;

        recordHistory();

        selection = next;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['clearSelection']} */
    function clearSelection() {
        if (destroyed) return false;
        if (!selection) return false;

        recordHistory();

        selection = null;
        markDocumentChanged();
        notify();
        return true;
    }

    /**
     * @param {ImageTypes.ImageSelection | null | undefined} selection
     * @returns {ImageTypes.ImageSelection | null}
     */
    function getSelectionState(selection) {
        if (!selection) return null;

        if (selection.type === "rectangle") {
            return {
                type: selection.type,
                x: selection.x,
                y: selection.y,
                width: selection.width,
                height: selection.height
            };
        }

        return {
            type: selection.type,
            points: selection.points.map(function (point) {
                return {x: point.x, y: point.y};
            })
        };
    }

    /**
     * @param {ImageTypes.ImageSelection | null | undefined} selection
     * @param {number} scaleX
     * @param {number} scaleY
     * @returns {ImageTypes.ImageSelection | null}
     */
    function getResizedSelectionState(selection, scaleX, scaleY) {
        const next = getSelectionState(selection);
        if (!next) return null;

        if (next.type === "rectangle") {
            next.x *= scaleX;
            next.y *= scaleY;
            next.width *= scaleX;
            next.height *= scaleY;

            if (!Number.isFinite(next.x) || !Number.isFinite(next.y)) {
                throw new TypeError("createImage: selection coordinates must be finite numbers.");
            }

            if (!Number.isFinite(next.width) || next.width <= 0 || !Number.isFinite(next.height) || next.height <= 0) {
                throw new TypeError("createImage: selection dimensions must be positive numbers.");
            }
        } else {
            for (const point of next.points) {
                point.x *= scaleX;
                point.y *= scaleY;

                if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
                    throw new TypeError("createImage: selection points must contain finite coordinates.");
                }
            }
        }

        return next;
    }

    /**
     * @param {string} id
     * @param {ImageTypes.ImageSelection | null | undefined} value
     * @returns {ImageTypes.ImageSelection | null | false}
     */
    function getOperationSelectionState(id, value) {
        if (value === undefined) return getLayerSelectionState(id, selection);

        validateOperationSelection(value);
        return getSelectionState(value);
    }

    /**
     * @param {string} id
     * @param {ImageTypes.ImageSelection | null} selection
     * @returns {ImageTypes.ImageLassoSelection | null | false}
     */
    function getLayerSelectionState(id, selection) {
        if (!selection) return null;

        const points = selection.type === "rectangle" ? [
            {x: selection.x, y: selection.y},
            {x: selection.x + selection.width, y: selection.y},
            {x: selection.x + selection.width, y: selection.y + selection.height},
            {x: selection.x, y: selection.y + selection.height}
        ] : selection.points;
        /** @type {ImageTypes.ImageLassoSelection} */
        const next = {type: "lasso", points: []};

        for (const point of points) {
            const local = canvasToLayer(id, point.x, point.y);
            if (!local || !Number.isFinite(local.x) || !Number.isFinite(local.y)) return false;

            next.points.push(local);
        }

        return next;
    }

    /**
     * @param {ImageTypes.ImageSelection | null | undefined} selection
     * @param {ImageTypes.ImageSelection | null | undefined} previous
     * @returns {boolean}
     */
    function isSelectionEqual(selection, previous) {
        if (!selection || !previous) return selection === previous;
        if (selection.type === "rectangle") {
            return previous.type === "rectangle" && selection.x === previous.x && selection.y === previous.y && selection.width === previous.width && selection.height === previous.height;
        }

        return previous.type === "lasso" && selection.points.length === previous.points.length && selection.points.every(function (point, index) {
            return point.x === previous.points[index].x && point.y === previous.points[index].y;
        });
    }

    /**
     * @param {ImageTypes.ImageSelection | null | undefined} selection
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    function isSelectionPoint(selection, x, y) {
        if (!selection) return true;

        if (selection.type === "rectangle") {
            return x >= selection.x && y >= selection.y && x < selection.x + selection.width && y < selection.y + selection.height;
        }

        let inside = false;
        let previous = selection.points[selection.points.length - 1];

        for (const point of selection.points) {
            if ((point.y > y) !== (previous.y > y) && x < point.x + (y - point.y) * (previous.x - point.x) / (previous.y - point.y)) {
                inside = !inside;
            }

            previous = point;
        }

        return inside;
    }

    /**
     * @param {ImageTypes.ImageSelection | null | undefined} selection
     * @returns {void}
     */
    function validateOperationSelection(selection) {
        if (selection === undefined || selection === null) return;

        if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
            throw new TypeError("createImage: layer operation selection must be an object or null.");
        }

        const {type} = selection;

        if (!["rectangle", "lasso"].includes(type)) {
            throw new TypeError("createImage: layer operation selection type must be 'rectangle' or 'lasso'.");
        }

        if (type === "rectangle") {
            const {x, y, width, height} = selection;

            if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) {
                throw new TypeError("createImage: layer operation selection coordinates must be finite numbers.");
            }

            if (typeof width !== "number" || !Number.isFinite(width) || width <= 0 || typeof height !== "number" || !Number.isFinite(height) || height <= 0) {
                throw new TypeError("createImage: layer operation selection dimensions must be positive numbers.");
            }
        } else {
            const {points} = selection;

            if (!Array.isArray(points) || !points.length) {
                throw new TypeError("createImage: layer operation selection points must be a non-empty array.");
            }

            for (const point of points) {
                if (!point || typeof point !== "object" || Array.isArray(point) || typeof point.x !== "number" || !Number.isFinite(point.x) || typeof point.y !== "number" || !Number.isFinite(point.y)) {
                    throw new TypeError("createImage: layer operation selection points must contain finite coordinates.");
                }
            }
        }
    }

    // endregion

    // region ===== Crop Controls ======================================================================================
    /** @type {ImageTypes.ImageCrop | null} */
    let crop = null;

    /** @type {ImageTypes.ImageEngine['setCrop']} */
    function setCrop(value) {
        if (destroyed) return false;

        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new TypeError("createImage: crop must be an object.");
        }

        const {x, y, width, height} = value;

        if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) {
            throw new TypeError("createImage: crop coordinates must be finite numbers.");
        }

        if (typeof width !== "number" || !Number.isFinite(width) || width <= 0 || typeof height !== "number" || !Number.isFinite(height) || height <= 0) {
            throw new TypeError("createImage: crop dimensions must be positive numbers.");
        }

        const next = {
            x: x,
            y: y,
            width: width,
            height: height
        };

        if (isCropEqual(next, crop)) return true;

        recordHistory();

        crop = next;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['clearCrop']} */
    function clearCrop() {
        if (destroyed) return false;
        if (!crop) return false;

        recordHistory();

        crop = null;
        markDocumentChanged();
        notify();
        return true;
    }

    /**
     * @param {ImageTypes.ImageCrop | null} crop
     * @returns {ImageTypes.ImageCrop | null}
     */
    function getCropState(crop) {
        if (!crop) return null;

        return {
            x: crop.x,
            y: crop.y,
            width: crop.width,
            height: crop.height
        };
    }

    /**
     * @param {ImageTypes.ImageCrop | null} crop
     * @param {ImageTypes.ImageCrop | null} previous
     * @returns {boolean}
     */
    function isCropEqual(crop, previous) {
        if (!crop || !previous) return crop === previous;

        return crop.x === previous.x && crop.y === previous.y && crop.width === previous.width && crop.height === previous.height;
    }

    // endregion

    // region ===== Straighten Controls ================================================================================
    let straighten = 0;

    /** @type {ImageTypes.ImageEngine['setStraighten']} */
    function setStraighten(degrees) {
        if (destroyed) return false;

        if (typeof degrees !== "number" || !Number.isFinite(degrees)) {
            throw new TypeError("createImage: straighten must be a finite number of degrees.");
        }

        if (straighten === degrees) return true;

        recordHistory();

        straighten = degrees;
        markDocumentChanged();
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine['resetStraighten']} */
    function resetStraighten() {
        if (destroyed) return false;
        if (straighten === 0) return false;

        recordHistory();

        straighten = 0;
        markDocumentChanged();
        notify();
        return true;
    }

    // endregion

    // region ===== History Controls ===================================================================================
    /** @type {ImageInternal.DocumentState[]} */
    const undoStack = [];
    /** @type {ImageInternal.DocumentState[]} */
    const redoStack = [];
    /** @type {ImageInternal.DocumentState | null} */
    let transactionState = null;

    /** @param {boolean} [copyOperations] @returns {ImageInternal.DocumentState} */
    function getDocumentState(copyOperations = false) {
        // Internal snapshots share immutable operations; serialization receives independent copies.
        return {
            canvasWidth: getCanvasWidth(),
            canvasHeight: getCanvasHeight(),
            canvasBackground: getCanvasBackground(),
            layers: layers.map(function (layer) {
                return {
                    id: layer.id,
                    source: layer.source,
                    sourceReference: layer.sourceReference,
                    name: layer.name,
                    visible: layer.visible,
                    opacity: layer.opacity,
                    transform: {
                        x: layer.transform.x,
                        y: layer.transform.y,
                        scaleX: layer.transform.scaleX,
                        scaleY: layer.transform.scaleY,
                        rotation: layer.transform.rotation,
                        flipX: layer.transform.flipX,
                        flipY: layer.transform.flipY,
                        perspective: getLayerPerspectiveState(layer.transform.perspective)
                    },
                    mask: layer.mask ? {
                        enabled: layer.mask.enabled,
                        operations: copyOperations ? layer.mask.operations.map(function (operation) {
                            return getLayerMaskOperationState(operation);
                        }) : layer.mask.operations,
                        operationIndex: layer.mask.operationIndex
                    } : null,
                    adjustments: layer.adjustments ? getLayerAdjustmentsState(layer.adjustments) : null,
                    liquify: layer.liquify ? {
                        enabled: layer.liquify.enabled,
                        operations: copyOperations ? layer.liquify.operations.map(function (operation) {
                            return getLayerLiquifyOperationState(operation);
                        }) : layer.liquify.operations,
                        historyIndex: layer.liquify.historyIndex
                    } : null,
                    paint: layer.paint ? {
                        enabled: layer.paint.enabled,
                        operations: copyOperations ? layer.paint.operations.map(function (operation) {
                            return getLayerPaintOperationState(operation);
                        }) : layer.paint.operations,
                        historyIndex: layer.paint.historyIndex
                    } : null,
                    retouch: layer.retouch ? {
                        enabled: layer.retouch.enabled,
                        operations: copyOperations ? layer.retouch.operations.map(function (operation) {
                            return getLayerRetouchOperationState(operation);
                        }) : layer.retouch.operations,
                        historyIndex: layer.retouch.historyIndex
                    } : null
                };
            }),
            selection: getSelectionState(selection),
            crop: getCropState(crop),
            straighten: straighten
        };
    }

    /** @param {ImageInternal.DocumentState} state */
    function restoreDocumentState(state) {
        const changed = !isDocumentStateEqual(state, true);

        const canvasSizeChanged = canvasWidthState !== state.canvasWidth || canvasHeightState !== state.canvasHeight;

        canvasWidthState = state.canvasWidth;
        canvasHeightState = state.canvasHeight;
        canvasBackgroundState = state.canvasBackground;
        selection = getSelectionState(state.selection);
        crop = getCropState(state.crop);
        straighten = state.straighten;

        for (const layer of layers) {
            if (!state.layers.some(function (next) {
                return next.id === layer.id && next.source === layer.source;
            })) clearLayerProxy(layer.id);
        }

        layers.length = 0;

        state.layers.forEach(function (layer) {
            layers.push({
                id: layer.id,
                source: layer.source,
                sourceReference: layer.sourceReference,
                name: layer.name,
                visible: layer.visible,
                opacity: layer.opacity,
                transform: {
                    x: layer.transform.x,
                    y: layer.transform.y,
                    scaleX: layer.transform.scaleX,
                    scaleY: layer.transform.scaleY,
                    rotation: layer.transform.rotation,
                    flipX: layer.transform.flipX,
                    flipY: layer.transform.flipY,
                    perspective: getLayerPerspectiveState(layer.transform.perspective)
                },
                mask: layer.mask ? {
                    enabled: layer.mask.enabled,
                    operations: layer.mask.operations,
                    operationIndex: layer.mask.operationIndex
                } : null,
                adjustments: layer.adjustments ? getLayerAdjustmentsState(layer.adjustments) : null,
                liquify: layer.liquify ? {
                    enabled: layer.liquify.enabled,
                    operations: layer.liquify.operations,
                    historyIndex: layer.liquify.historyIndex
                } : null,
                paint: layer.paint ? {
                    enabled: layer.paint.enabled,
                    operations: layer.paint.operations,
                    historyIndex: layer.paint.historyIndex
                } : null,
                retouch: layer.retouch ? {
                    enabled: layer.retouch.enabled,
                    operations: layer.retouch.operations,
                    historyIndex: layer.retouch.historyIndex
                } : null
            });
        });

        if (canvasSizeChanged) refitIfFitted();
        if (changed) markDocumentChanged();
        return changed;
    }

    /** @param {ImageInternal.DocumentState} state @param {boolean} [activeOnly] */
    function isDocumentStateEqual(state, activeOnly = false) {
        if (canvasWidthState !== state.canvasWidth || canvasHeightState !== state.canvasHeight || canvasBackgroundState !== state.canvasBackground || layers.length !== state.layers.length || !isSelectionEqual(selection, state.selection) || !isCropEqual(crop, state.crop) || straighten !== state.straighten) return false;

        return layers.every(function (layer, index) {
            const previous = state.layers[index];

            return layer.id === previous.id && layer.source === previous.source && layer.sourceReference === previous.sourceReference && layer.name === previous.name && layer.visible === previous.visible && layer.opacity === previous.opacity && isLayerTransformEqual(layer.transform, previous.transform) && isLayerMaskEqual(layer.mask, previous.mask, activeOnly) && isLayerAdjustmentsEqual(layer.adjustments, previous.adjustments) && isLayerLiquifyEqual(layer.liquify, previous.liquify, activeOnly) && isLayerPaintEqual(layer.paint, previous.paint, activeOnly) && isLayerRetouchEqual(layer.retouch, previous.retouch, activeOnly);
        });
    }

    function recordHistory() {
        if (transactionState) return;

        undoStack.push(getDocumentState());
        redoStack.length = 0;
    }

    /** @type {ImageTypes.ImageEngine["undo"]} */
    function undo() {
        if (destroyed) return false;
        if (!canUndo()) return false;

        const couldUndo = canUndo();
        const couldRedo = canRedo();

        redoStack.push(getDocumentState());
        const changed = restoreDocumentState(/** @type {ImageInternal.DocumentState} */ (undoStack.pop()));
        if (changed || couldUndo !== canUndo() || couldRedo !== canRedo()) notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine["redo"]} */
    function redo() {
        if (destroyed) return false;
        if (!canRedo()) return false;

        const couldUndo = canUndo();
        const couldRedo = canRedo();

        undoStack.push(getDocumentState());
        const changed = restoreDocumentState(/** @type {ImageInternal.DocumentState} */ (redoStack.pop()));
        if (changed || couldUndo !== canUndo() || couldRedo !== canRedo()) notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine["canUndo"]} */
    function canUndo() {
        return !destroyed && !transactionState && undoStack.length > 0;
    }

    /** @type {ImageTypes.ImageEngine["canRedo"]} */
    function canRedo() {
        return !destroyed && !transactionState && redoStack.length > 0;
    }

    /** @type {ImageTypes.ImageEngine["beginTransaction"]} */
    function beginTransaction() {
        if (destroyed) return false;
        if (transactionState) return false;

        const changed = canUndo() || canRedo();

        transactionState = getDocumentState();
        if (changed) notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine["commitTransaction"]} */
    function commitTransaction() {
        if (destroyed) return false;
        if (!transactionState) return false;

        const state = transactionState;
        transactionState = null;

        if (!isDocumentStateEqual(state)) {
            undoStack.push(state);
            redoStack.length = 0;
        }

        if (canUndo() || canRedo()) notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine["cancelTransaction"]} */
    function cancelTransaction() {
        if (destroyed) return false;
        if (!transactionState) return false;

        const state = transactionState;
        transactionState = null;
        const changed = restoreDocumentState(state);
        if (changed || canUndo() || canRedo()) notify();
        return true;
    }

    // endregion

    // region ===== Persistence ========================================================================================
    /** @type {ImageTypes.ImageEngine["serialize"]} */
    function serialize() {
        const state = getDocumentState(true);

        const serializedLayers = state.layers.map(function (layer) {
            const {sourceReference, ...serializedLayer} = layer;
            if (typeof sourceReference !== "string") {
                throw new TypeError("createImage: layer source reference must be a string to serialize the document.");
            }

            return {...serializedLayer, source: sourceReference};
        });

        return {...state, layers: serializedLayers};
    }

    /** @type {ImageTypes.ImageEngine["load"]} */
    function load(serialized) {
        if (destroyed) return false;

        if (!serialized || typeof serialized !== "object" || Array.isArray(serialized)) {
            throw new TypeError("createImage: serialized document must be an object.");
        }

        const {canvasWidth, canvasHeight, canvasBackground, layers, selection, crop, straighten = 0} = serialized;

        if (typeof canvasWidth !== "number" || !Number.isFinite(canvasWidth) || canvasWidth < 0 || typeof canvasHeight !== "number" || !Number.isFinite(canvasHeight) || canvasHeight < 0 || (canvasWidth === 0) !== (canvasHeight === 0)) {
            throw new TypeError("createImage: serialized canvas dimensions must be positive numbers or both zero.");
        }

        if (typeof canvasBackground !== "string") {
            throw new TypeError("createImage: canvas background must be a string.");
        }

        if (!Array.isArray(layers)) {
            throw new TypeError("createImage: serialized layers must be an array.");
        }

        if (typeof straighten !== "number" || !Number.isFinite(straighten)) {
            throw new TypeError("createImage: straighten must be a finite number of degrees.");
        }

        /** @type {ImageInternal.DocumentState} */
        const next = {
            canvasWidth: canvasWidth,
            canvasHeight: canvasHeight,
            canvasBackground: canvasBackground,
            layers: [],
            selection: null,
            crop: null,
            straighten: straighten
        };
        const ids = new Set();

        for (const layer of layers) {
            if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
                throw new TypeError("createImage: layer must be an object.");
            }

            const {id, source, name, visible, opacity, transform, mask, adjustments, liquify, paint, retouch} = layer;

            if (typeof id !== "string" || !id.length || ids.has(id)) {
                throw new TypeError("createImage: serialized layer IDs must be unique non-empty strings.");
            }

            ids.add(id);

            if (typeof source !== "string") {
                throw new TypeError("createImage: serialized layer source must be a string.");
            }

            if (typeof name !== "string") {
                throw new TypeError("createImage: layer name must be a string.");
            }

            if (typeof visible !== "boolean") {
                throw new TypeError("createImage: layer visibility must be a boolean.");
            }

            if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
                throw new TypeError("createImage: layer opacity must be a number between 0 and 1.");
            }

            if (!transform || typeof transform !== "object" || Array.isArray(transform)) {
                throw new TypeError("createImage: layer transform must be an object.");
            }

            for (const key of Reflect.ownKeys(transform)) {
                if (typeof key !== "string" || !["x", "y", "scaleX", "scaleY", "rotation", "flipX", "flipY", "perspective"].includes(key)) {
                    throw new TypeError("createImage: layer transform contains an unknown property.");
                }
            }

            const {x, y, scaleX, scaleY, rotation, flipX, flipY, perspective = null} = transform;

            if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) {
                throw new TypeError("createImage: layer coordinates must be finite numbers.");
            }

            if (typeof scaleX !== "number" || !Number.isFinite(scaleX) || scaleX <= 0 || typeof scaleY !== "number" || !Number.isFinite(scaleY) || scaleY <= 0) {
                throw new TypeError("createImage: layer scales must be positive numbers.");
            }

            if (typeof rotation !== "number" || !Number.isFinite(rotation)) {
                throw new TypeError("createImage: layer rotation must be a finite number of degrees.");
            }

            if (typeof flipX !== "boolean" || typeof flipY !== "boolean") {
                throw new TypeError("createImage: layer flips must be booleans.");
            }

            if (perspective !== null) {
                if (!perspective || typeof perspective !== "object" || Array.isArray(perspective)) {
                    throw new TypeError("createImage: layer perspective must be an object or null.");
                }

                for (const name of /** @type {const} */ (["topLeft", "topRight", "bottomRight", "bottomLeft"])) {
                    const point = perspective[name];
                    if (!point || typeof point !== "object" || Array.isArray(point) || typeof point.x !== "number" || !Number.isFinite(point.x) || typeof point.y !== "number" || !Number.isFinite(point.y)) {
                        throw new TypeError("createImage: layer perspective corners must contain finite coordinates.");
                    }
                }
            }

            if (mask !== null) {
                if (!mask || typeof mask !== "object" || Array.isArray(mask)) {
                    throw new TypeError("createImage: layer mask must be an object or null.");
                }

                if (typeof mask.enabled !== "boolean") {
                    throw new TypeError("createImage: layer mask enabled must be a boolean.");
                }

                if (!Array.isArray(mask.operations)) {
                    throw new TypeError("createImage: layer mask operations must be an array.");
                }

                if (!Number.isInteger(mask.operationIndex) || mask.operationIndex < 0 || mask.operationIndex > mask.operations.length) {
                    throw new TypeError("createImage: layer mask operation index must be an integer within its history.");
                }

                for (const operation of mask.operations) {
                    if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
                        throw new TypeError("createImage: layer mask operation must be an object.");
                    }

                    validateOperationSelection(operation.selection);

                    const {type, points, size, hardness, opacity} = operation;

                    if (!["erase", "restore"].includes(type)) {
                        throw new TypeError("createImage: layer mask operation type must be 'erase' or 'restore'.");
                    }

                    if (!Array.isArray(points) || !points.length) {
                        throw new TypeError("createImage: layer mask operation points must be a non-empty array.");
                    }

                    for (const point of points) {
                        if (!point || typeof point !== "object" || Array.isArray(point) || typeof point.x !== "number" || !Number.isFinite(point.x) || typeof point.y !== "number" || !Number.isFinite(point.y)) {
                            throw new TypeError("createImage: layer mask operation points must contain finite coordinates.");
                        }
                    }

                    if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
                        throw new TypeError("createImage: layer mask operation size must be a positive number.");
                    }

                    if (typeof hardness !== "number" || !Number.isFinite(hardness) || hardness < 0 || hardness > 1) {
                        throw new TypeError("createImage: layer mask operation hardness must be a number between 0 and 1.");
                    }

                    if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
                        throw new TypeError("createImage: layer mask operation opacity must be a number between 0 and 1.");
                    }
                }
            }

            if (adjustments !== null) {
                if (!adjustments || typeof adjustments !== "object" || Array.isArray(adjustments)) {
                    throw new TypeError("createImage: layer adjustments must be an object or null.");
                }

                if (typeof adjustments.enabled !== "boolean") {
                    throw new TypeError("createImage: layer adjustments enabled must be a boolean.");
                }

                const {values} = adjustments;

                if (!values || typeof values !== "object" || Array.isArray(values)) {
                    throw new TypeError("createImage: layer adjustment values must be an object.");
                }

                const names = /** @type {const} */ (["exposure", "brightness", "contrast", "highlights", "shadows", "temperature", "tint", "saturation", "vibrance", "clarity", "sharpness"]);

                for (const name of Reflect.ownKeys(values)) {
                    if (!names.some(function (key) { return key === name; })) {
                        throw new TypeError("createImage: layer adjustment name is not supported.");
                    }
                }

                for (const name of names) {
                    if (typeof values[name] !== "number" || !Number.isFinite(values[name])) {
                        throw new TypeError("createImage: layer adjustment value must be a finite number.");
                    }
                }
            }

            if (liquify !== null) {
                if (!liquify || typeof liquify !== "object" || Array.isArray(liquify)) {
                    throw new TypeError("createImage: layer liquify must be an object or null.");
                }

                if (typeof liquify.enabled !== "boolean") {
                    throw new TypeError("createImage: layer liquify enabled must be a boolean.");
                }

                if (!Array.isArray(liquify.operations)) {
                    throw new TypeError("createImage: layer liquify operations must be an array.");
                }

                if (!Number.isInteger(liquify.historyIndex) || liquify.historyIndex < 0 || liquify.historyIndex > liquify.operations.length) {
                    throw new TypeError("createImage: layer liquify history index must be an integer within its history.");
                }

                for (const operation of liquify.operations) {
                    if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
                        throw new TypeError("createImage: layer liquify operation must be an object.");
                    }

                    validateOperationSelection(operation.selection);

                    const {type, points, size, strength, density, rate} = operation;

                    if (!["push", "restore", "shrink", "bloat", "twirl"].includes(type)) {
                        throw new TypeError("createImage: layer liquify operation type must be 'push', 'restore', 'shrink', 'bloat', or 'twirl'.");
                    }

                    if (!Array.isArray(points) || !points.length) {
                        throw new TypeError("createImage: layer liquify operation points must be a non-empty array.");
                    }

                    for (const point of points) {
                        if (!point || typeof point !== "object" || Array.isArray(point) || typeof point.x !== "number" || !Number.isFinite(point.x) || typeof point.y !== "number" || !Number.isFinite(point.y)) {
                            throw new TypeError("createImage: layer liquify operation points must contain finite coordinates.");
                        }
                    }

                    if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
                        throw new TypeError("createImage: layer liquify operation size must be a positive number.");
                    }

                    if (typeof strength !== "number" || !Number.isFinite(strength)) {
                        throw new TypeError("createImage: layer liquify operation strength must be a finite number.");
                    }

                    if (typeof density !== "number" || !Number.isFinite(density)) {
                        throw new TypeError("createImage: layer liquify operation density must be a finite number.");
                    }

                    if (typeof rate !== "number" || !Number.isFinite(rate)) {
                        throw new TypeError("createImage: layer liquify operation rate must be a finite number.");
                    }
                }
            }

            if (paint !== null) {
                if (!paint || typeof paint !== "object" || Array.isArray(paint)) {
                    throw new TypeError("createImage: layer paint must be an object or null.");
                }

                if (typeof paint.enabled !== "boolean") {
                    throw new TypeError("createImage: layer paint enabled must be a boolean.");
                }

                if (!Array.isArray(paint.operations)) {
                    throw new TypeError("createImage: layer paint operations must be an array.");
                }

                if (!Number.isInteger(paint.historyIndex) || paint.historyIndex < 0 || paint.historyIndex > paint.operations.length) {
                    throw new TypeError("createImage: layer paint history index must be an integer within its history.");
                }

                for (const operation of paint.operations) {
                    if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
                        throw new TypeError("createImage: layer paint operation must be an object.");
                    }

                    validateOperationSelection(operation.selection);

                    const {type} = operation;

                    if (!["brush", "pencil", "fill", "gradient"].includes(type)) {
                        throw new TypeError("createImage: layer paint operation type must be 'brush', 'pencil', 'fill', or 'gradient'.");
                    }

                    if (type === "brush") {
                        const {points, size, hardness, opacity, color} = operation;

                        if (!Array.isArray(points) || !points.length) {
                            throw new TypeError("createImage: layer paint operation points must be a non-empty array.");
                        }

                        for (const point of points) {
                            if (!point || typeof point !== "object" || Array.isArray(point) || typeof point.x !== "number" || !Number.isFinite(point.x) || typeof point.y !== "number" || !Number.isFinite(point.y)) {
                                throw new TypeError("createImage: layer paint operation points must contain finite coordinates.");
                            }
                        }

                        if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
                            throw new TypeError("createImage: layer paint operation size must be a positive number.");
                        }

                        if (typeof hardness !== "number" || !Number.isFinite(hardness) || hardness < 0 || hardness > 1) {
                            throw new TypeError("createImage: layer paint operation hardness must be a number between 0 and 1.");
                        }

                        if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
                            throw new TypeError("createImage: layer paint operation opacity must be a number between 0 and 1.");
                        }

                        if (typeof color !== "string") {
                            throw new TypeError("createImage: layer paint operation color must be a string.");
                        }
                    } else if (type === "pencil") {
                        const {points, size, opacity, color} = operation;

                        if (!Array.isArray(points) || !points.length) {
                            throw new TypeError("createImage: layer paint operation points must be a non-empty array.");
                        }

                        for (const point of points) {
                            if (!point || typeof point !== "object" || Array.isArray(point) || typeof point.x !== "number" || !Number.isFinite(point.x) || typeof point.y !== "number" || !Number.isFinite(point.y)) {
                                throw new TypeError("createImage: layer paint operation points must contain finite coordinates.");
                            }
                        }

                        if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
                            throw new TypeError("createImage: layer paint operation size must be a positive number.");
                        }

                        if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
                            throw new TypeError("createImage: layer paint operation opacity must be a number between 0 and 1.");
                        }

                        if (typeof color !== "string") {
                            throw new TypeError("createImage: layer paint operation color must be a string.");
                        }
                    } else if (type === "fill") {
                        const {x, y, color, opacity, tolerance} = operation;

                        if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) {
                            throw new TypeError("createImage: layer paint fill coordinates must be finite numbers.");
                        }

                        if (typeof color !== "string") {
                            throw new TypeError("createImage: layer paint operation color must be a string.");
                        }

                        if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
                            throw new TypeError("createImage: layer paint operation opacity must be a number between 0 and 1.");
                        }

                        if (typeof tolerance !== "number" || !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1) {
                            throw new TypeError("createImage: layer paint fill tolerance must be a number between 0 and 1.");
                        }
                    } else {
                        const {startX, startY, endX, endY, startColor, endColor, opacity} = operation;

                        if (typeof startX !== "number" || !Number.isFinite(startX) || typeof startY !== "number" || !Number.isFinite(startY) || typeof endX !== "number" || !Number.isFinite(endX) || typeof endY !== "number" || !Number.isFinite(endY)) {
                            throw new TypeError("createImage: layer paint gradient coordinates must be finite numbers.");
                        }

                        if (startX === endX && startY === endY) {
                            throw new TypeError("createImage: layer paint gradient start and end positions must be different.");
                        }

                        if (typeof startColor !== "string" || typeof endColor !== "string") {
                            throw new TypeError("createImage: layer paint gradient colors must be strings.");
                        }

                        if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
                            throw new TypeError("createImage: layer paint operation opacity must be a number between 0 and 1.");
                        }
                    }
                }
            }

            if (retouch !== null) {
                if (!retouch || typeof retouch !== "object" || Array.isArray(retouch)) {
                    throw new TypeError("createImage: layer retouch must be an object or null.");
                }

                if (typeof retouch.enabled !== "boolean") {
                    throw new TypeError("createImage: layer retouch enabled must be a boolean.");
                }

                if (!Array.isArray(retouch.operations)) {
                    throw new TypeError("createImage: layer retouch operations must be an array.");
                }

                if (!Number.isInteger(retouch.historyIndex) || retouch.historyIndex < 0 || retouch.historyIndex > retouch.operations.length) {
                    throw new TypeError("createImage: layer retouch history index must be an integer within its history.");
                }

                for (const operation of retouch.operations) {
                    if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
                        throw new TypeError("createImage: layer retouch operation must be an object.");
                    }

                    validateOperationSelection(operation.selection);

                    const {type, sourceX, sourceY, points, size, hardness, opacity} = operation;

                    if (!["clone", "heal"].includes(type)) {
                        throw new TypeError("createImage: layer retouch operation type must be 'clone' or 'heal'.");
                    }

                    if (typeof sourceX !== "number" || !Number.isFinite(sourceX) || typeof sourceY !== "number" || !Number.isFinite(sourceY)) {
                        throw new TypeError("createImage: layer retouch source coordinates must be finite numbers.");
                    }

                    if (!Array.isArray(points) || !points.length) {
                        throw new TypeError("createImage: layer retouch operation points must be a non-empty array.");
                    }

                    for (const point of points) {
                        if (!point || typeof point !== "object" || Array.isArray(point) || typeof point.x !== "number" || !Number.isFinite(point.x) || typeof point.y !== "number" || !Number.isFinite(point.y)) {
                            throw new TypeError("createImage: layer retouch operation points must contain finite coordinates.");
                        }
                    }

                    if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
                        throw new TypeError("createImage: layer retouch operation size must be a positive number.");
                    }

                    if (typeof hardness !== "number" || !Number.isFinite(hardness) || hardness < 0 || hardness > 1) {
                        throw new TypeError("createImage: layer retouch operation hardness must be a number between 0 and 1.");
                    }

                    if (typeof opacity !== "number" || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
                        throw new TypeError("createImage: layer retouch operation opacity must be a number between 0 and 1.");
                    }
                }
            }

            next.layers.push({
                id: id,
                source: source,
                sourceReference: source,
                name: name,
                visible: visible,
                opacity: opacity,
                transform: {
                    x: x,
                    y: y,
                    scaleX: scaleX,
                    scaleY: scaleY,
                    rotation: rotation < 0 || rotation >= 360 ? ((rotation % 360) + 360) % 360 : rotation,
                    flipX: flipX,
                    flipY: flipY,
                    perspective: getLayerPerspectiveState(perspective)
                },
                mask: mask ? {
                    enabled: mask.enabled,
                    operations: mask.operations.map(function (operation) {
                        return getLayerMaskOperationState(operation);
                    }),
                    operationIndex: mask.operationIndex
                } : null,
                adjustments: adjustments ? getLayerAdjustmentsState(adjustments) : null,
                liquify: liquify ? {
                    enabled: liquify.enabled,
                    operations: liquify.operations.map(function (operation) {
                        return getLayerLiquifyOperationState(operation);
                    }),
                    historyIndex: liquify.historyIndex
                } : null,
                paint: paint ? {
                    enabled: paint.enabled,
                    operations: paint.operations.map(function (operation) {
                        return getLayerPaintOperationState(operation);
                    }),
                    historyIndex: paint.historyIndex
                } : null,
                retouch: retouch ? {
                    enabled: retouch.enabled,
                    operations: retouch.operations.map(function (operation) {
                        return getLayerRetouchOperationState(operation);
                    }),
                    historyIndex: retouch.historyIndex
                } : null
            });
        }

        if (selection !== null) {
            if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
                throw new TypeError("createImage: selection must be an object or null.");
            }

            const {type} = selection;

            if (!["rectangle", "lasso"].includes(type)) {
                throw new TypeError("createImage: selection type must be 'rectangle' or 'lasso'.");
            }

            if (type === "rectangle") {
                const {x, y, width, height} = selection;

                if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) {
                    throw new TypeError("createImage: selection coordinates must be finite numbers.");
                }

                if (typeof width !== "number" || !Number.isFinite(width) || width <= 0 || typeof height !== "number" || !Number.isFinite(height) || height <= 0) {
                    throw new TypeError("createImage: selection dimensions must be positive numbers.");
                }
            } else {
                const {points} = selection;

                if (!Array.isArray(points) || !points.length) {
                    throw new TypeError("createImage: selection points must be a non-empty array.");
                }

                for (const point of points) {
                    if (!point || typeof point !== "object" || Array.isArray(point) || typeof point.x !== "number" || !Number.isFinite(point.x) || typeof point.y !== "number" || !Number.isFinite(point.y)) {
                        throw new TypeError("createImage: selection points must contain finite coordinates.");
                    }
                }
            }

            next.selection = getSelectionState(selection);
        }

        if (crop !== null) {
            if (!crop || typeof crop !== "object" || Array.isArray(crop)) {
                throw new TypeError("createImage: crop must be an object or null.");
            }

            const {x, y, width, height} = crop;

            if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) {
                throw new TypeError("createImage: crop coordinates must be finite numbers.");
            }

            if (typeof width !== "number" || !Number.isFinite(width) || width <= 0 || typeof height !== "number" || !Number.isFinite(height) || height <= 0) {
                throw new TypeError("createImage: crop dimensions must be positive numbers.");
            }

            next.crop = getCropState(crop);
        }

        const couldUndo = canUndo();
        const couldRedo = canRedo();
        const changed = restoreDocumentState(next);
        undoStack.length = 0;
        redoStack.length = 0;
        transactionState = null;
        if (changed || couldUndo || couldRedo) notify();
        return true;
    }

    // endregion

    // region ===== Rendering ==========================================================================================
    /** @type {Map<string, ImageInternal.LayerProxy>} */
    const layerProxies = new Map();
    /** @type {HTMLCanvasElement | null} */
    let documentRenderCanvas = null;
    /** @type {HTMLCanvasElement | null} */
    let layerPerspectiveCanvas = null;
    /** @type {HTMLCanvasElement | null} */
    let layerAdjustmentsCanvas = null;
    /** @type {HTMLCanvasElement | null} */
    let layerLiquifyCanvas = null;
    /** @type {HTMLCanvasElement | null} */
    let layerLiquifySourceCanvas = null;
    /** @type {HTMLCanvasElement | null} */
    let layerRetouchCanvas = null;
    /** @type {HTMLCanvasElement | null} */
    let layerRetouchStrokeCanvas = null;
    /** @type {HTMLCanvasElement | null} */
    let layerPaintCanvas = null;
    /** @type {HTMLCanvasElement | null} */
    let layerPaintStrokeCanvas = null;
    /** @type {HTMLCanvasElement | null} */
    let layerRenderCanvas = null;
    /** @type {HTMLCanvasElement | null} */
    let layerMaskCanvas = null;
    /** @type {HTMLCanvasElement | null} */
    let layerMaskStrokeCanvas = null;

    cleanups.push(function () {
        for (const id of layerProxies.keys()) clearLayerProxy(id);
    });

    /** @type {ImageTypes.ImageEngine['render']} */
    function render(target) {
        if (destroyed) return false;

        return renderDocument(target, 1);
    }

    /** @type {ImageTypes.ImageEngine['renderPreview']} */
    function renderPreview(target, maxWidth, maxHeight) {
        if (destroyed) return false;

        if (typeof maxWidth !== "number" || !Number.isFinite(maxWidth) || maxWidth < 1 || typeof maxHeight !== "number" || !Number.isFinite(maxHeight) || maxHeight < 1) {
            throw new TypeError("createImage: preview dimensions must be finite numbers of at least 1 pixel.");
        }

        const width = getRasterDimension(crop ? crop.width : getCanvasWidth());
        const height = getRasterDimension(crop ? crop.height : getCanvasHeight());
        const outputScale = Math.min(1, Math.floor(maxWidth) / width, Math.floor(maxHeight) / height);

        return renderDocument(target, outputScale, true, true);
    }

    /** @type {ImageTypes.ImageEngine['exportImage']} */
    async function exportImage(options = {}) {
        if (destroyed) throw new Error("createImage: the image has been destroyed.");

        if (!options || typeof options !== "object" || Array.isArray(options)) {
            throw new TypeError("createImage: export options must be an object.");
        }

        const {type = "image/png", quality = 0.92} = options;

        if (!["image/png", "image/jpeg", "image/webp"].includes(type)) {
            throw new TypeError("createImage: export type must be 'image/png', 'image/jpeg', or 'image/webp'.");
        }

        if (typeof quality !== "number" || !Number.isFinite(quality) || quality < 0 || quality > 1) {
            throw new TypeError("createImage: export quality must be a number between 0 and 1.");
        }

        try {
            const target = ownerDocument.createElement("canvas");

            if (!render(target)) {
                throw new Error("createImage: the image could not be rendered for export.");
            }

            const blob = await new Promise(/** @param {(value: Blob) => void} resolve */ function (resolve, reject) {
                target.toBlob(function (blob) {
                    if (!blob || blob.type !== type) {
                        reject(new Error("createImage: the image could not be encoded as the requested type."));
                        return;
                    }

                    resolve(blob);
                }, type, type === "image/png" ? undefined : quality);
            });

            if (destroyed) throw new Error("createImage: the image has been destroyed.");

            return blob;
        } catch (error) {
            if (!destroyed) reportError("image-export-failed", "The image could not be exported.", error);
            throw error;
        }
    }

    /** @type {ImageTypes.ImageEngine['pickColor']} */
    function pickColor(x, y) {
        if (destroyed) return false;

        if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) {
            throw new TypeError("createImage: canvas coordinates must be finite numbers.");
        }

        if (x < 0 || y < 0 || x >= getCanvasWidth() || y >= getCanvasHeight()) return null;

        const radians = getStraightenRadians();
        if (!radians && crop && (x < crop.x || y < crop.y || x >= crop.x + crop.width || y >= crop.y + crop.height)) return null;

        let sampleX = x;
        let sampleY = y;

        if (radians) {
            const centerX = getCanvasWidth() / 2;
            const centerY = getCanvasHeight() / 2;
            const cos = Math.cos(radians);
            const sin = Math.sin(radians);

            sampleX = centerX + (x - centerX) * cos - (y - centerY) * sin;
            sampleY = centerY + (x - centerX) * sin + (y - centerY) * cos;
        }

        sampleX = Math.floor(sampleX - (crop ? crop.x : 0));
        sampleY = Math.floor(sampleY - (crop ? crop.y : 0));

        if (sampleX < 0 || sampleY < 0 || sampleX >= getRasterDimension(crop ? crop.width : getCanvasWidth()) || sampleY >= getRasterDimension(crop ? crop.height : getCanvasHeight())) return null;

        try {
            const target = ownerDocument.createElement("canvas");
            if (!render(target)) return false;

            const context = target.getContext("2d");
            if (!context) return false;

            const data = context.getImageData(sampleX, sampleY, 1, 1).data;

            return {
                r: data[0],
                g: data[1],
                b: data[2],
                a: data[3],
                hex: "#" + data[0].toString(16).padStart(2, "0") + data[1].toString(16).padStart(2, "0") + data[2].toString(16).padStart(2, "0")
            };
        } catch {
            return false;
        }
    }

    function getStraightenRadians() {
        return (straighten % 360) * Math.PI / 180;
    }

    /** @param {number} value */
    function getRasterDimension(value) {
        // Positive logical dimensions always need at least one backing pixel.
        return value > 0 ? Math.max(1, Math.floor(value)) : 0;
    }

    /**
     * @param {HTMLCanvasElement} target
     * @param {number} outputScale
     */
    function renderDocument(target, outputScale, transformDocument = true, preview = false) {
        const targetDocument = target && target.ownerDocument;
        // Detached documents have no window, but their canvases still carry the correct native prototype.
        const canvasPrototype = targetDocument && (targetDocument.defaultView?.HTMLCanvasElement?.prototype || Object.getPrototypeOf(targetDocument.createElement("canvas")));

        if (!canvasPrototype || !Object.prototype.isPrototypeOf.call(canvasPrototype, target)) {
            throw new TypeError("createImage: render target must be a <canvas> element.");
        }

        // History shares source objects, so rendering into one would also alter a future restoration.
        for (const stack of [undoStack, redoStack, transactionState ? [transactionState] : []]) {
            for (const state of stack) {
                if (state.layers.some(function (layer) { return layer.source === target; })) {
                    throw new TypeError("createImage: render target must not be a layer source retained by history.");
                }
            }
        }

        for (const layer of layers) {
            if (layer.source === target) {
                throw new TypeError("createImage: render target must not be a layer source.");
            }

            if (!layer.visible) continue;
            if (typeof layer.source === "string") return false;
            if ("naturalWidth" in layer.source && (!layer.source.complete || !layer.source.naturalWidth || !layer.source.naturalHeight)) return false;
        }

        try {
            const context = target.getContext("2d");
            if (!context) return false;

            const outputCrop = transformDocument ? crop : null;
            const width = getRasterDimension(outputCrop ? outputCrop.width : getCanvasWidth());
            const height = getRasterDimension(outputCrop ? outputCrop.height : getCanvasHeight());
            const radians = transformDocument ? getStraightenRadians() : 0;

            // Keep even the thin axis of a preview drawable, including intermediate document composition.
            target.width = preview ? Math.max(1, Math.round(width * outputScale)) : width * outputScale;
            target.height = preview ? Math.max(1, Math.round(height * outputScale)) : height * outputScale;
            const outputScaleX = preview && width > 0 ? target.width / width : outputScale;
            const outputScaleY = preview && height > 0 ? target.height / height : outputScale;
            const scaled = outputScaleX !== 1 || outputScaleY !== 1;
            context.clearRect(0, 0, target.width, target.height);
            if (outputCrop || radians || scaled) context.save();

            try {
                if (scaled) context.scale(outputScaleX, outputScaleY);

                if (outputCrop) {
                    context.translate(-outputCrop.x, -outputCrop.y);
                    context.beginPath();
                    context.rect(0, 0, getCanvasWidth(), getCanvasHeight());
                    context.clip();
                    context.beginPath();
                }

                if (radians) {
                    if (!documentRenderCanvas) {
                        documentRenderCanvas = ownerDocument.createElement("canvas");

                        const canvas = documentRenderCanvas;
                        cleanups.push(function () {
                            canvas.width = 0;
                            canvas.height = 0;
                            documentRenderCanvas = null;
                        });
                    }

                    // Compose before applying the document angle and crop, using preview resolution only for previews.
                    const documentScale = preview ? outputScale : 1;
                    if (!renderDocument(documentRenderCanvas, documentScale, false, preview)) return false;

                    context.translate(getCanvasWidth() / 2, getCanvasHeight() / 2);
                    context.rotate(radians);
                    context.translate(-getCanvasWidth() / 2, -getCanvasHeight() / 2);
                    context.drawImage(documentRenderCanvas, 0, 0, getRasterDimension(getCanvasWidth()), getRasterDimension(getCanvasHeight()));
                    return true;
                }

                if (getCanvasBackground() !== "transparent") {
                    context.fillStyle = getCanvasBackground();
                    context.fillRect(0, 0, outputCrop ? getCanvasWidth() : width, outputCrop ? getCanvasHeight() : height);
                }

                for (const layer of layers) {
                    if (!layer.visible) continue;

                    const proxy = preview ? getLayerProxy(layer, Math.max(outputScaleX, outputScaleY)) : null;
                    const sourceScaleX = proxy ? proxy.canvas.width / proxy.width : 1;
                    const sourceScaleY = proxy ? proxy.canvas.height / proxy.height : 1;
                    const source = renderLayerSource(layer, proxy);
                    if (!source) return false;

                    const {x, y, scaleX, scaleY, rotation, flipX, flipY} = layer.transform;
                    context.save();

                    try {
                        context.globalAlpha = layer.opacity;
                        context.translate(x, y);
                        context.rotate(rotation * Math.PI / 180);
                        context.scale(flipX ? -scaleX : scaleX, flipY ? -scaleY : scaleY);

                        if (layer.transform.perspective) {
                            if (!renderLayerPerspective(context, layer, source, sourceScaleX, sourceScaleY)) return false;
                        } else if (proxy) {
                            context.drawImage(source, 0, 0, proxy.width, proxy.height);
                        } else {
                            context.drawImage(source, 0, 0);
                        }
                    } finally {
                        context.restore();
                    }
                }
            } finally {
                if (outputCrop || radians || scaled) context.restore();
            }
        } catch {
            return false;
        }

        return true;
    }

    /**
     * @param {ImageInternal.LayerState} layer
     * @param {number} outputScale
     */
    function getLayerProxy(layer, outputScale) {
        const source = layer.source;
        if (typeof source === "string") return null;

        const src = "currentSrc" in source && typeof source.currentSrc === "string" && source.currentSrc || ("src" in source && typeof source.src === "string" ? source.src : undefined);
        let width = "width" in source && typeof source.width === "number" ? source.width : NaN;
        let height = "height" in source && typeof source.height === "number" ? source.height : NaN;

        if ("naturalWidth" in source) {
            width = source.naturalWidth;
            height = source.naturalHeight;
        }

        const proxy = layerProxies.get(layer.id);

        if (proxy && (proxy.source !== source || proxy.src !== src || proxy.width !== width || proxy.height !== height)) {
            clearLayerProxy(layer.id);
        }

        if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;

        const previewWidth = Math.floor(crop ? crop.width : getCanvasWidth()) * outputScale;
        const previewHeight = Math.floor(crop ? crop.height : getCanvasHeight()) * outputScale;
        if (width < previewWidth * 2 && height < previewHeight * 2) return null;

        const {scaleX, scaleY, perspective} = layer.transform;
        let scale = outputScale * Math.max(scaleX, scaleY);

        if (perspective) {
            const matrix = getLayerPerspectiveTransform(layer);
            if (!matrix) return null;

            const [a, b, c, d, e, f, g, h] = matrix;
            const denominator = Math.min(1, 1 + g * width, 1 + h * height, 1 + g * width + h * height);
            if (denominator <= 0) return null;

            // Bound the warp's local magnification so its most enlarged region retains enough source detail.
            const xx = Math.max(Math.abs(a - g * c), Math.abs(a - g * c + (a * h - g * b) * height)) * scaleX;
            const xy = Math.max(Math.abs(b - h * c), Math.abs(b - h * c + (b * g - h * a) * width)) * scaleX;
            const yx = Math.max(Math.abs(d - g * f), Math.abs(d - g * f + (d * h - g * e) * height)) * scaleY;
            const yy = Math.max(Math.abs(e - h * f), Math.abs(e - h * f + (e * g - h * d) * width)) * scaleY;
            scale = outputScale * Math.sqrt(Math.max(xx + xy, yx + yy) * Math.max(xx + yx, xy + yy)) / (denominator * denominator);
        }

        if (!Number.isFinite(scale) || scale <= 0 || scale > 0.5) return null;

        const proxyWidth = Math.max(1, Math.ceil(width * scale));
        const proxyHeight = Math.max(1, Math.ceil(height * scale));
        if (proxyWidth >= width && proxyHeight >= height) return null;

        const cached = layerProxies.get(layer.id);
        const reusable = cached && cached.canvas.width >= proxyWidth && cached.canvas.height >= proxyHeight;
        const mutable = "getContext" in source && typeof source.getContext === "function";
        if (reusable && !mutable) return cached;

        const canvas = reusable ? cached.canvas : ownerDocument.createElement("canvas");
        const canvasWidth = reusable ? canvas.width : proxyWidth;
        const canvasHeight = reusable ? canvas.height : proxyHeight;
        // Reset reused proxies so erased pixels and previous canvas state cannot survive a refresh.
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        const context = canvas.getContext("2d");
        if (!context) return null;

        try {
            context.drawImage(source, 0, 0, canvasWidth, canvasHeight);
        } catch {
            return null;
        }

        if (reusable) return cached;

        const next = {source: source, src: src, width: width, height: height, canvas: canvas};
        clearLayerProxy(layer.id);
        layerProxies.set(layer.id, next);
        return next;
    }

    /**
     * @param {string} id
     */
    function clearLayerProxy(id) {
        const proxy = layerProxies.get(id);
        if (!proxy) return;

        proxy.canvas.width = 0;
        proxy.canvas.height = 0;
        layerProxies.delete(id);
    }

    /**
     * @param {CanvasRenderingContext2D} context
     * @param {ImageInternal.LayerState} layer
     * @param {ImageInternal.LayerSource} source
     */
    function renderLayerPerspective(context, layer, source, sourceScaleX = 1, sourceScaleY = 1) {
        const matrix = getLayerPerspectiveTransform(layer, true);
        if (!matrix) return false;

        const transform = context.getTransform();
        const determinant = transform.a * transform.d - transform.b * transform.c;
        if (!Number.isFinite(determinant) || !determinant) return false;

        const {topLeft, topRight, bottomRight, bottomLeft} = /** @type {ImageTypes.ImageLayerPerspective} */ (layer.transform.perspective);
        const corners = [topLeft, topRight, bottomRight, bottomLeft];
        let left = 0;
        let top = 0;
        let right = context.canvas.width;
        let bottom = context.canvas.height;

        // A warp crossing the projective horizon has no finite corner bounds.
        if (corners.every(function (point) {
            return matrix[6] * point.x + matrix[7] * point.y + matrix[8] > 0;
        })) {
            const xs = corners.map(function (point) {
                return transform.a * point.x + transform.c * point.y + transform.e;
            });
            const ys = corners.map(function (point) {
                return transform.b * point.x + transform.d * point.y + transform.f;
            });

            left = Math.max(left, Math.floor(Math.min(xs[0], xs[1], xs[2], xs[3])));
            top = Math.max(top, Math.floor(Math.min(ys[0], ys[1], ys[2], ys[3])));
            right = Math.min(right, Math.ceil(Math.max(xs[0], xs[1], xs[2], xs[3])));
            bottom = Math.min(bottom, Math.ceil(Math.max(ys[0], ys[1], ys[2], ys[3])));
        }

        if (left >= right || top >= bottom) return true;

        let width = "width" in source && typeof source.width === "number" ? source.width : NaN;
        let height = "height" in source && typeof source.height === "number" ? source.height : NaN;

        if ("naturalWidth" in source) {
            width = source.naturalWidth;
            height = source.naturalHeight;
        }

        if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return false;

        const cornerTolerance = Number.EPSILON * 16 * Math.max(1, ...corners.map(function (point) {
            return Math.max(Math.abs(point.x), Math.abs(point.y));
        }));

        // Document resizing can introduce affine corners; keep those on the native drawing path.
        if (Math.abs(bottomRight.x - topRight.x - bottomLeft.x + topLeft.x) <= cornerTolerance && Math.abs(bottomRight.y - topRight.y - bottomLeft.y + topLeft.y) <= cornerTolerance) {
            const sourceWidth = width / sourceScaleX;
            const sourceHeight = height / sourceScaleY;
            context.save();

            try {
                context.transform(
                    (topRight.x - topLeft.x) / sourceWidth,
                    (topRight.y - topLeft.y) / sourceWidth,
                    (bottomLeft.x - topLeft.x) / sourceHeight,
                    (bottomLeft.y - topLeft.y) / sourceHeight,
                    topLeft.x,
                    topLeft.y
                );
                context.drawImage(source, 0, 0, sourceWidth, sourceHeight);
            } finally {
                context.restore();
            }

            return true;
        }

        if (!layerPerspectiveCanvas) {
            layerPerspectiveCanvas = ownerDocument.createElement("canvas");

            const canvas = layerPerspectiveCanvas;
            cleanups.push(function () {
                canvas.width = 0;
                canvas.height = 0;
                layerPerspectiveCanvas = null;
            });
        }

        layerPerspectiveCanvas.width = width;
        layerPerspectiveCanvas.height = height;

        const layerContext = layerPerspectiveCanvas.getContext("2d");
        if (!layerContext) return false;

        layerContext.drawImage(source, 0, 0);
        const original = layerContext.getImageData(0, 0, width, height);

        layerPerspectiveCanvas.width = right - left;
        layerPerspectiveCanvas.height = bottom - top;

        const result = layerContext.createImageData(right - left, bottom - top);

        // Inverse-map output pixel centers through the same homography as coordinate conversion.
        for (let y = top; y < bottom; y++) {
            for (let x = left; x < right; x++) {
                const px = x + 0.5 - transform.e;
                const py = y + 0.5 - transform.f;
                const point = transformLayerPerspectivePoint(matrix, (transform.d * px - transform.c * py) / determinant, (transform.a * py - transform.b * px) / determinant);
                if (!point || point.x < 0 || point.x * sourceScaleX >= width || point.y < 0 || point.y * sourceScaleY >= height) continue;

                const sourceX = Math.max(0, Math.min(width - 1, point.x * sourceScaleX - 0.5));
                const sourceY = Math.max(0, Math.min(height - 1, point.y * sourceScaleY - 0.5));
                const sampleLeft = Math.floor(sourceX);
                const sampleTop = Math.floor(sourceY);
                const fractionX = sourceX - sampleLeft;
                const fractionY = sourceY - sampleTop;
                let red = 0;
                let green = 0;
                let blue = 0;
                let alpha = 0;

                for (let row = 0; row < 2; row++) {
                    for (let column = 0; column < 2; column++) {
                        const sampleX = sampleLeft + column;
                        const sampleY = sampleTop + row;
                        if (sampleX >= width || sampleY >= height) continue;

                        const sample = (sampleY * width + sampleX) * 4;
                        const weight = (column ? fractionX : 1 - fractionX) * (row ? fractionY : 1 - fractionY);
                        const coverage = original.data[sample + 3] * weight;
                        red += original.data[sample] * coverage;
                        green += original.data[sample + 1] * coverage;
                        blue += original.data[sample + 2] * coverage;
                        alpha += coverage;
                    }
                }

                const offset = ((y - top) * result.width + x - left) * 4;
                result.data[offset] = alpha ? red / alpha : 0;
                result.data[offset + 1] = alpha ? green / alpha : 0;
                result.data[offset + 2] = alpha ? blue / alpha : 0;
                result.data[offset + 3] = alpha;
            }
        }

        layerContext.putImageData(result, 0, 0);
        context.save();

        try {
            context.setTransform(1, 0, 0, 1, 0, 0);
            context.drawImage(layerPerspectiveCanvas, left, top);
        } finally {
            context.restore();
        }

        return true;
    }

    /**
     * @param {ImageInternal.LayerState} layer
     * @param {ImageInternal.LayerProxy | null} [proxy]
     * @returns {ImageInternal.LayerSource | null}
     */
    function renderLayerSource(layer, proxy = null) {
        /** @type {ImageInternal.LayerSource | null} */
        let source = proxy ? proxy.canvas : typeof layer.source === "string" ? null : layer.source;
        if (!source) return null;
        const scaleX = proxy ? proxy.canvas.width / proxy.width : 1;
        const scaleY = proxy ? proxy.canvas.height / proxy.height : 1;

        if (layer.adjustments && layer.adjustments.enabled) source = renderLayerAdjustments(layer, source, scaleX, scaleY);
        if (!source) return null;
        if (layer.liquify && layer.liquify.enabled && layer.liquify.historyIndex) source = renderLayerLiquify(layer, source, scaleX, scaleY);
        if (!source) return null;
        if (layer.retouch && layer.retouch.enabled && layer.retouch.historyIndex) source = renderLayerRetouch(layer, source, scaleX, scaleY);
        if (!source) return null;
        if (layer.paint && layer.paint.enabled && layer.paint.historyIndex) source = renderLayerPaint(layer, source, scaleX, scaleY);
        if (!source) return null;
        if (layer.mask && layer.mask.enabled && layer.mask.operationIndex) source = renderLayerMask(layer, source, scaleX, scaleY);
        return source;
    }

    /**
     * @param {ImageInternal.LayerState} layer
     * @param {ImageInternal.LayerSource} source
     */
    function renderLayerAdjustments(layer, source, scaleX = 1, scaleY = 1) {
        const adjustments = /** @type {ImageTypes.ImageLayerAdjustments} */ (layer.adjustments);
        const values = adjustments.values;
        if (!Object.keys(values).some(function (name) {
            return values[/** @type {keyof ImageTypes.ImageLayerAdjustmentValues} */ (name)] !== 0;
        })) return source;

        let width = "width" in source && typeof source.width === "number" ? source.width : NaN;
        let height = "height" in source && typeof source.height === "number" ? source.height : NaN;

        if ("naturalWidth" in source) {
            width = source.naturalWidth;
            height = source.naturalHeight;
        }

        if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;

        if (!layerAdjustmentsCanvas) {
            layerAdjustmentsCanvas = ownerDocument.createElement("canvas");

            const canvas = layerAdjustmentsCanvas;
            cleanups.push(function () {
                canvas.width = 0;
                canvas.height = 0;
                layerAdjustmentsCanvas = null;
            });
        }

        layerAdjustmentsCanvas.width = width;
        layerAdjustmentsCanvas.height = height;

        const context = layerAdjustmentsCanvas.getContext("2d");
        if (!context) return null;

        context.drawImage(source, 0, 0);

        const result = context.getImageData(0, 0, width, height);

        // Apply tone and color first, then broad local contrast and fine sharpening.
        applyLayerAdjustmentColors(result.data, values);
        if (values.clarity) applyLayerAdjustmentDetail(result, 8, values.clarity, scaleX, scaleY);
        if (values.sharpness) applyLayerAdjustmentDetail(result, 1, values.sharpness, scaleX, scaleY);

        context.putImageData(result, 0, 0);
        return layerAdjustmentsCanvas;
    }

    /**
     * @param {Uint8ClampedArray} data
     * @param {ImageTypes.ImageLayerAdjustmentValues} values
     */
    function applyLayerAdjustmentColors(data, values) {
        if (!values.exposure && !values.brightness && !values.contrast && !values.highlights && !values.shadows && !values.temperature && !values.tint && !values.saturation && !values.vibrance) return;

        // Exposure uses stops in linear light; other controls use normalized amounts without changing stored values.
        const exposure = Math.pow(2, Math.max(-32, Math.min(32, values.exposure)));
        const brightness = Math.max(-1, Math.min(1, values.brightness));
        const contrast = Math.pow(2, Math.max(-1, Math.min(1, values.contrast)) * 2);
        const highlights = Math.max(-1, Math.min(1, values.highlights)) * 0.5;
        const shadows = Math.max(-1, Math.min(1, values.shadows)) * 0.5;
        const temperature = Math.max(-1, Math.min(1, values.temperature)) * 0.25;
        const tint = Math.max(-1, Math.min(1, values.tint)) * 0.25;
        const saturation = 1 + Math.max(-1, Math.min(1, values.saturation));
        const vibrance = Math.max(-1, Math.min(1, values.vibrance));
        const colors = new Float64Array(256);

        for (let index = 0; index < colors.length; index++) {
            const color = index / 255;
            const linear = (color <= 0.04045 ? color / 12.92 : Math.pow((color + 0.055) / 1.055, 2.4)) * exposure;
            colors[index] = values.exposure ? Math.min(1, linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055) : color;
        }

        for (let index = 0; index < data.length; index += 4) {
            if (!data[index + 3]) continue;

            // Exposure, brightness, contrast, highlights, shadows, temperature, tint, saturation, vibrance.
            let red = Math.max(0, Math.min(1, (colors[data[index]] + brightness - 0.5) * contrast + 0.5));
            let green = Math.max(0, Math.min(1, (colors[data[index + 1]] + brightness - 0.5) * contrast + 0.5));
            let blue = Math.max(0, Math.min(1, (colors[data[index + 2]] + brightness - 0.5) * contrast + 0.5));
            let luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
            let amount = highlights * luminance * luminance;

            red = Math.max(0, Math.min(1, red + amount));
            green = Math.max(0, Math.min(1, green + amount));
            blue = Math.max(0, Math.min(1, blue + amount));
            luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
            amount = shadows * (1 - luminance) * (1 - luminance);

            red = Math.max(0, Math.min(1, red + amount));
            green = Math.max(0, Math.min(1, green + amount));
            blue = Math.max(0, Math.min(1, blue + amount));
            red = Math.max(0, Math.min(1, red + temperature + tint * 0.5));
            green = Math.max(0, Math.min(1, green - tint));
            blue = Math.max(0, Math.min(1, blue - temperature + tint * 0.5));
            luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;

            red = Math.max(0, Math.min(1, luminance + (red - luminance) * saturation));
            green = Math.max(0, Math.min(1, luminance + (green - luminance) * saturation));
            blue = Math.max(0, Math.min(1, luminance + (blue - luminance) * saturation));
            luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
            amount = 1 + vibrance * (1 - Math.max(red, green, blue) + Math.min(red, green, blue));

            data[index] = Math.max(0, Math.min(1, luminance + (red - luminance) * amount)) * 255;
            data[index + 1] = Math.max(0, Math.min(1, luminance + (green - luminance) * amount)) * 255;
            data[index + 2] = Math.max(0, Math.min(1, luminance + (blue - luminance) * amount)) * 255;
        }
    }

    /**
     * @param {ImageData} result
     * @param {number} radius
     * @param {number} value
     * @param {number} scaleX
     * @param {number} scaleY
     */
    function applyLayerAdjustmentDetail(result, radius, value, scaleX, scaleY) {
        const width = result.width;
        const height = result.height;
        const radiusX = Math.min(width - 1, Math.max(1, Math.round(radius * scaleX)));
        const radiusY = Math.min(height - 1, Math.max(1, Math.round(radius * scaleY)));
        const amount = Math.max(-1, Math.min(1, value)) * Math.min(1, radius * scaleX, radius * scaleY);
        const original = new Uint8ClampedArray(result.data);
        const columns = new Float64Array(width * 4);
        const totals = new Float64Array(4);

        // Average premultiplied colors so transparent neighbors cannot introduce dark fringes.
        for (let y = 0; y <= radiusY; y++) {
            for (let x = 0; x < width; x++) {
                const offset = (y * width + x) * 4;

                for (let channel = 0; channel < 3; channel++) columns[x * 4 + channel] += original[offset + channel] * original[offset + 3];
                columns[x * 4 + 3] += original[offset + 3];
            }
        }

        for (let y = 0; y < height; y++) {
            totals.fill(0);

            for (let x = 0; x <= radiusX; x++) {
                for (let channel = 0; channel < 4; channel++) totals[channel] += columns[x * 4 + channel];
            }

            for (let x = 0; x < width; x++) {
                const offset = (y * width + x) * 4;

                if (original[offset + 3] && totals[3]) {
                    for (let channel = 0; channel < 3; channel++) {
                        result.data[offset + channel] = original[offset + channel] + (original[offset + channel] - totals[channel] / totals[3]) * amount;
                    }
                }

                const left = x - radiusX;
                const right = x + radiusX + 1;

                for (let channel = 0; channel < 4; channel++) {
                    if (left >= 0) totals[channel] -= columns[left * 4 + channel];
                    if (right < width) totals[channel] += columns[right * 4 + channel];
                }
            }

            const top = y - radiusY;
            const bottom = y + radiusY + 1;

            for (let x = 0; x < width; x++) {
                const first = (top * width + x) * 4;
                const last = (bottom * width + x) * 4;

                for (let channel = 0; channel < 3; channel++) {
                    if (top >= 0) columns[x * 4 + channel] -= original[first + channel] * original[first + 3];
                    if (bottom < height) columns[x * 4 + channel] += original[last + channel] * original[last + 3];
                }

                if (top >= 0) columns[x * 4 + 3] -= original[first + 3];
                if (bottom < height) columns[x * 4 + 3] += original[last + 3];
            }
        }
    }

    /**
     * @param {ImageTypes.ImageSelection | null | undefined} selection
     * @param {number} width
     * @param {number} height
     */
    function getLayerSelectionMask(selection, width, height, scaleX = 1, scaleY = 1) {
        if (!selection) return null;

        const mask = new Uint8Array(width * height);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (isSelectionPoint(selection, (x + 0.5) / scaleX, (y + 0.5) / scaleY)) mask[y * width + x] = 1;
            }
        }

        return mask;
    }

    /**
     * @param {CanvasRenderingContext2D} context
     * @param {Uint8Array | null} mask
     */
    function applyLayerSelectionMask(context, mask) {
        if (!mask) return;

        const width = context.canvas.width;
        const height = context.canvas.height;

        for (let y = 0; y < height; y++) {
            let x = 0;

            while (x < width) {
                if (mask[y * width + x]) {
                    x++;
                    continue;
                }

                const left = x;
                while (x < width && !mask[y * width + x]) x++;
                context.clearRect(left, y, x - left, 1);
            }
        }
    }

    /**
     * @param {ImageInternal.LayerState} layer
     * @param {ImageInternal.LayerSource} source
     */
    function renderLayerLiquify(layer, source, scaleX = 1, scaleY = 1) {
        let width = "width" in source && typeof source.width === "number" ? source.width : NaN;
        let height = "height" in source && typeof source.height === "number" ? source.height : NaN;

        if ("naturalWidth" in source) {
            width = source.naturalWidth;
            height = source.naturalHeight;
        }

        if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;

        if (!layerLiquifyCanvas) {
            layerLiquifyCanvas = ownerDocument.createElement("canvas");
            layerLiquifySourceCanvas = ownerDocument.createElement("canvas");

            const canvas = layerLiquifyCanvas;
            const sourceCanvas = layerLiquifySourceCanvas;
            cleanups.push(function () {
                canvas.width = 0;
                canvas.height = 0;
                layerLiquifyCanvas = null;
                sourceCanvas.width = 0;
                sourceCanvas.height = 0;
                layerLiquifySourceCanvas = null;
            });
        }

        const sourceCanvas = /** @type {HTMLCanvasElement} */ (layerLiquifySourceCanvas);
        const size = 256;
        const border = 64;
        layerLiquifyCanvas.width = width;
        layerLiquifyCanvas.height = height;
        sourceCanvas.width = size + 1;
        sourceCanvas.height = size + 1;

        const context = layerLiquifyCanvas.getContext("2d");
        const sourceContext = sourceCanvas.getContext("2d");
        if (!context || !sourceContext) return null;

        const points = getLayerLiquifyPoints(layer, width, height, scaleX, scaleY);
        /** @type {ImageRender.LiquifyCache} */
        const cache = {keys: null, values: null, ages: null, clock: 0};
        /** @type {Map<string, ImageRender.LiquifySource>} */
        const sourceCache = new Map();
        const length = Math.min(width, size + border * 2) * Math.min(height, size + border * 2) * 2;
        const tile = {x: 0, y: 0, width: 0, height: 0, field: new Float32Array(length), scratch: new Float32Array(length)};
        const result = context.createImageData(size, size);

        for (let top = 0; top < height; top += size) {
            for (let left = 0; left < width; left += size) {
                const tileWidth = Math.min(size, width - left);
                const tileHeight = Math.min(size, height - top);
                tile.x = Math.max(0, left - border);
                tile.y = Math.max(0, top - border);
                tile.width = Math.min(width, left + tileWidth + border) - tile.x;
                tile.height = Math.min(height, top + tileHeight + border) - tile.y;
                tile.field.fill(0);

                // Replay from identity. The border handles nearby dependencies; farther samples replay the exact earlier map.
                const point = {};

                for (const segment of points.segments) {
                    const range = getLayerLiquifyRange(segment, tile.x + 0.5, tile.y + 0.5, tile.x + tile.width - 0.5, tile.y + tile.height - 0.5, scaleX, scaleY);
                    if (!range) continue;

                    for (let step = range.first; step <= range.last; step++) {
                        const index = segment.index + step - 1;
                        getLayerLiquifyPoint(segment, index, width, height, scaleX, scaleY, point);
                        renderLayerLiquifyPoint(tile, point, points, index, width, height, scaleX, scaleY, cache);
                    }
                }

                const original = getLayerLiquifySource(sourceContext, source, left, top, size, sourceCache);

                for (let y = 0; y < tileHeight; y++) {
                    result.data.set(original.pixels.data.subarray(y * (size + 1) * 4, (y * (size + 1) + tileWidth) * 4), y * size * 4);

                    for (let x = 0; x < tileWidth; x++) {
                        const index = ((top + y - tile.y) * tile.width + left + x - tile.x) * 2;
                        const offset = (y * size + x) * 4;
                        if (!tile.field[index] && !tile.field[index + 1]) continue;

                        const sourceX = left + x + tile.field[index];
                        const sourceY = top + y + tile.field[index + 1];
                        const firstX = Math.floor(sourceX);
                        const firstY = Math.floor(sourceY);
                        const fractionX = sourceX - firstX;
                        const fractionY = sourceY - firstY;
                        const original = firstX < width && firstX + 1 >= 0 && firstY < height && firstY + 1 >= 0 ? getLayerLiquifySource(sourceContext, source, Math.max(0, firstX), Math.max(0, firstY), size, sourceCache) : null;
                        let red = 0;
                        let green = 0;
                        let blue = 0;
                        let alpha = 0;

                        // Interpolate premultiplied colors; source tiles include the next row and column across their edges.
                        for (let row = 0; row < 2; row++) {
                            for (let column = 0; column < 2; column++) {
                                const sampleX = firstX + column;
                                const sampleY = firstY + row;
                                if (!original || sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) continue;

                                const sample = ((sampleY - original.y) * (size + 1) + sampleX - original.x) * 4;
                                const weight = (column ? fractionX : 1 - fractionX) * (row ? fractionY : 1 - fractionY);
                                const coverage = original.pixels.data[sample + 3] * weight;
                                red += original.pixels.data[sample] * coverage;
                                green += original.pixels.data[sample + 1] * coverage;
                                blue += original.pixels.data[sample + 2] * coverage;
                                alpha += coverage;
                            }
                        }

                        result.data[offset] = alpha ? red / alpha : 0;
                        result.data[offset + 1] = alpha ? green / alpha : 0;
                        result.data[offset + 2] = alpha ? blue / alpha : 0;
                        result.data[offset + 3] = alpha;
                    }
                }

                context.putImageData(result, left, top, 0, 0, tileWidth, tileHeight);
            }
        }

        return layerLiquifyCanvas;
    }

    /**
     * @param {CanvasRenderingContext2D} context
     * @param {ImageInternal.LayerSource} source
     * @param {number} x
     * @param {number} y
     * @param {number} size
     * @param {Map<string, ImageRender.LiquifySource>} cache
     */
    function getLayerLiquifySource(context, source, x, y, size, cache) {
        const left = Math.floor(x / size) * size;
        const top = Math.floor(y / size) * size;
        const key = left + ":" + top;
        const previous = cache.get(key);
        if (previous) return previous;

        context.clearRect(0, 0, size + 1, size + 1);
        context.drawImage(source, -left, -top);

        const next = {x: left, y: top, pixels: context.getImageData(0, 0, size + 1, size + 1)};
        if (cache.size === 16) cache.delete(/** @type {string} */ (cache.keys().next().value));
        cache.set(key, next);
        return next;
    }

    /**
     * @param {ImageInternal.LayerState} layer
     * @param {number} width
     * @param {number} height
     * @param {number} scaleX
     * @param {number} scaleY
     */
    function getLayerLiquifyPoints(layer, width, height, scaleX, scaleY) {
        const liquify = /** @type {ImageTypes.ImageSerializedLayerLiquify} */ (layer.liquify);
        /** @type {ImageRender.LiquifyPoints} */
        const points = {segments: [], length: 0};

        for (let index = 0; index < liquify.historyIndex; index++) {
            const operation = liquify.operations[index];
            const radius = operation.size / 2;
            const strength = Math.max(-1, Math.min(1, operation.strength));
            const density = Math.max(0, Math.min(1, operation.density));
            const rate = Math.max(0, Math.min(1, operation.rate));
            if (!radius || !strength || !rate) continue;

            const spacing = Math.max(1, radius / 4);
            const first = operation.points[0];

            // Size is the diameter; density sets the solid core, strength and rate use normalized values.
            if (operation.type !== "push") {
                addLayerLiquifyPoints(points, operation.type, first.x, first.y, radius, density, strength * rate, 0, 0, 1, operation.selection);
            }

            for (let index = 1; index < operation.points.length; index++) {
                const previous = operation.points[index - 1];
                const point = operation.points[index];
                const deltaX = point.x - previous.x;
                const deltaY = point.y - previous.y;
                const distance = Math.hypot(deltaX, deltaY);
                if (!Number.isFinite(distance)) continue;

                // Only interpolate the part whose brush can reach the source, including strokes that start off-canvas.
                let start = 0;
                let end = 1;

                for (const axis of /** @type {const} */ (["x", "y"])) {
                    const delta = axis === "x" ? deltaX : deltaY;
                    const maximum = (axis === "x" ? width / scaleX : height / scaleY) + radius;

                    if (!delta) {
                        if (previous[axis] < -radius || previous[axis] > maximum) end = -1;
                    } else {
                        const first = (-radius - previous[axis]) / delta;
                        const last = (maximum - previous[axis]) / delta;
                        start = Math.max(start, Math.min(first, last));
                        end = Math.min(end, Math.max(first, last));
                    }
                }

                if (start > end) continue;

                const length = distance * (end - start);
                const steps = Math.max(1, Math.ceil(length / spacing));
                const stepX = deltaX * (end - start) / steps;
                const stepY = deltaY * (end - start) / steps;
                const startX = previous.x + deltaX * start;
                const startY = previous.y + deltaY * start;
                const amount = strength * rate * (operation.type === "push" ? 1 : Math.min(1, length / steps / spacing));

                addLayerLiquifyPoints(points, operation.type, startX, startY, radius, density, amount, stepX, stepY, steps, operation.selection);
            }
        }

        return points;
    }

    /**
     * @param {ImageRender.LiquifyPoints} points
     * @param {ImageTypes.ImageLayerLiquifyOperation['type']} type
     * @param {number} x
     * @param {number} y
     * @param {number} radius
     * @param {number} density
     * @param {number} amount
     * @param {number} deltaX
     * @param {number} deltaY
     * @param {number} steps
     * @param {ImageTypes.ImageSelection | null | undefined} selection
     */
    function addLayerLiquifyPoints(points, type, x, y, radius, density, amount, deltaX, deltaY, steps, selection) {
        if (!amount) return;

        // Keep each interpolated segment compact instead of allocating one object for every brush stamp.
        points.segments.push({type: type, x: x, y: y, radius: radius, density: density, amount: amount, deltaX: deltaX, deltaY: deltaY, steps: steps, selection: selection, index: points.length});
        points.length += steps;
    }

    /**
     * @param {ImageRender.LiquifyPoints} points
     * @param {number} index
     */
    function getLayerLiquifySegment(points, index) {
        let first = 0;
        let last = points.segments.length - 1;

        while (first < last) {
            const middle = Math.ceil((first + last) / 2);
            if (points.segments[middle].index <= index) first = middle;
            else last = middle - 1;
        }

        return points.segments[first];
    }

    /**
     * @param {ImageRender.LiquifySegment} segment
     * @param {number} left
     * @param {number} top
     * @param {number} right
     * @param {number} bottom
     * @param {number} scaleX
     * @param {number} scaleY
     */
    function getLayerLiquifyRange(segment, left, top, right, bottom, scaleX, scaleY) {
        let first = 1;
        let last = segment.steps;

        for (const axis of /** @type {const} */ (["x", "y"])) {
            const delta = axis === "x" ? segment.deltaX : segment.deltaY;
            const minimum = (axis === "x" ? left / scaleX : top / scaleY) - segment.radius;
            const maximum = (axis === "x" ? right / scaleX : bottom / scaleY) + segment.radius;

            if (!delta) {
                if (segment[axis] < minimum || segment[axis] > maximum) return null;
            } else {
                const start = (minimum - segment[axis]) / delta;
                const end = (maximum - segment[axis]) / delta;
                first = Math.max(first, Math.floor(Math.min(start, end)));
                last = Math.min(last, Math.ceil(Math.max(start, end)));
            }
        }

        return first <= last ? {first: first, last: last} : null;
    }

    /**
     * @param {ImageRender.LiquifySegment} segment
     * @param {number} index
     * @param {number} width
     * @param {number} height
     * @param {number} scaleX
     * @param {number} scaleY
     * @param {Partial<ImageRender.LiquifyPoint>} point
     * @returns {asserts point is ImageRender.LiquifyPoint}
     */
    function getLayerLiquifyPoint(segment, index, width, height, scaleX, scaleY, point) {
        const step = index - segment.index + 1;
        point.type = segment.type;
        point.x = segment.x + segment.deltaX * step;
        point.y = segment.y + segment.deltaY * step;
        point.radius = segment.radius;
        point.density = segment.density;
        point.amount = segment.amount;
        point.deltaX = segment.deltaX;
        point.deltaY = segment.deltaY;
        point.selection = segment.selection;
        point.left = Math.max(0, Math.ceil((point.x - point.radius) * scaleX - 0.5));
        point.top = Math.max(0, Math.ceil((point.y - point.radius) * scaleY - 0.5));
        point.right = Math.min(width - 1, Math.floor((point.x + point.radius) * scaleX - 0.5));
        point.bottom = Math.min(height - 1, Math.floor((point.y + point.radius) * scaleY - 0.5));
    }

    /**
     * @param {ImageRender.LiquifyPoint} point
     * @param {number} x
     * @param {number} y
     * @param {number} scaleX
     * @param {number} scaleY
     * @param {ImageRender.LiquifySample} sample
     */
    function getLayerLiquifySample(point, x, y, scaleX, scaleY, sample) {
        if (x < point.left || x > point.right || y < point.top || y > point.bottom) return false;
        if (!isSelectionPoint(point.selection, (x + 0.5) / scaleX, (y + 0.5) / scaleY)) return false;

        const relativeX = (x + 0.5) / scaleX - point.x;
        const relativeY = (y + 0.5) / scaleY - point.y;
        const distance = Math.hypot(relativeX, relativeY) / point.radius;
        if (distance >= 1) return false;

        const edge = distance <= point.density ? 0 : (distance - point.density) / (1 - point.density);
        const influence = point.amount * (1 - edge * edge * (3 - 2 * edge));
        sample.x = x;
        sample.y = y;
        sample.restore = -1;

        if (point.type === "restore") {
            sample.restore = 1 - Math.min(1, Math.abs(influence));
        } else if (point.type === "push") {
            sample.x -= point.deltaX * influence * scaleX;
            sample.y -= point.deltaY * influence * scaleY;
        } else if (point.type === "twirl") {
            const angle = -influence * Math.PI / 4;
            const cosine = Math.cos(angle);
            const sine = Math.sin(angle);
            sample.x += (relativeX * (cosine - 1) - relativeY * sine) * scaleX;
            sample.y += (relativeX * sine + relativeY * (cosine - 1)) * scaleY;
        } else {
            const scale = Math.exp((point.type === "shrink" ? influence : -influence) / 2) - 1;
            sample.x += relativeX * scale * scaleX;
            sample.y += relativeY * scale * scaleY;
        }

        return true;
    }

    /**
     * @param {ImageRender.LiquifyCache} cache
     * @param {number} index
     * @param {number} position
     */
    function getLayerLiquifyCached(cache, index, position) {
        if (!cache.keys) return -1;

        const ages = /** @type {Uint32Array} */ (cache.ages);

        // Four slots per bucket bound memory; evicted displacements are rebuilt from the same history.
        const first = ((Math.imul(index + 1, 73856093) ^ Math.imul(position, 19349663)) & (ages.length / 4 - 1)) * 4;

        for (let slot = first; slot < first + 4; slot++) {
            if (cache.keys[slot * 2] === index + 1 && cache.keys[slot * 2 + 1] === position) {
                ages[slot] = ++cache.clock;
                return slot;
            }
        }

        return -1;
    }

    /**
     * @param {ImageRender.LiquifyCache} cache
     * @param {number} index
     * @param {number} position
     * @param {ImageRender.Point} value
     */
    function setLayerLiquifyCached(cache, index, position, value) {
        if (!cache.keys) {
            cache.keys = new Float64Array(262144 * 2);
            cache.values = new Float32Array(262144 * 2);
            cache.ages = new Uint32Array(262144);
        }

        const ages = /** @type {Uint32Array} */ (cache.ages);
        const values = /** @type {Float32Array} */ (cache.values);

        const first = ((Math.imul(index + 1, 73856093) ^ Math.imul(position, 19349663)) & (ages.length / 4 - 1)) * 4;
        let next = first;

        for (let slot = first + 1; slot < first + 4; slot++) {
            if (ages[slot] < ages[next]) next = slot;
        }

        cache.keys[next * 2] = index + 1;
        cache.keys[next * 2 + 1] = position;
        values[next * 2] = value.x;
        values[next * 2 + 1] = value.y;
        ages[next] = ++cache.clock;
    }

    /**
     * @param {ImageRender.LiquifyPoints} points
     * @param {number} index
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     * @param {number} scaleX
     * @param {number} scaleY
     * @param {ImageRender.LiquifyCache} cache
     * @returns {ImageRender.Point}
     */
    function getLayerLiquifyDisplacement(points, index, x, y, width, height, scaleX, scaleY, cache) {
        if (index < 0) return {x: 0, y: 0};

        const previous = getLayerLiquifyCached(cache, index, y * width + x);
        if (previous >= 0) {
            const values = /** @type {Float32Array} */ (cache.values);
            return {x: values[previous * 2], y: values[previous * 2 + 1]};
        }

        // A bounded cache and an explicit stack keep long histories and distant dependencies off the call stack.
        /** @type {ImageRender.PendingLiquifyFrame[]} */
        const stack = [{index: index, x: x, y: y}];
        const point = {};
        const sample = {x: 0, y: 0, restore: -1};
        /** @type {ImageRender.Point | null} */
        let result = null;

        while (stack.length) {
            const frame = stack[stack.length - 1];

            if (!frame.samples) {
                while (frame.index >= 0) {
                    const segment = getLayerLiquifySegment(points, frame.index);
                    const range = getLayerLiquifyRange(segment, frame.x + 0.5, frame.y + 0.5, frame.x + 0.5, frame.y + 0.5, scaleX, scaleY);

                    if (!range || frame.index < segment.index + range.first - 1 || !isSelectionPoint(segment.selection, (frame.x + 0.5) / scaleX, (frame.y + 0.5) / scaleY)) {
                        frame.index = segment.index - 1;
                        continue;
                    }

                    frame.index = Math.min(frame.index, segment.index + range.last - 1);
                    getLayerLiquifyPoint(segment, frame.index, width, height, scaleX, scaleY, point);
                    if (getLayerLiquifySample(point, frame.x, frame.y, scaleX, scaleY, sample)) break;
                    frame.index--;
                }

                if (frame.index < 0) {
                    result = {x: 0, y: 0};
                    stack.pop();
                    continue;
                }

                const previous = getLayerLiquifyCached(cache, frame.index, frame.y * width + frame.x);
                if (previous >= 0) {
                    const values = /** @type {Float32Array} */ (cache.values);
                    result = {x: values[previous * 2], y: values[previous * 2 + 1]};
                    stack.pop();
                    continue;
                }

                frame.sourceX = sample.x;
                frame.sourceY = sample.y;
                frame.restore = sample.restore;
                const sampleX = Math.max(0, Math.min(width - 1, sample.x));
                const sampleY = Math.max(0, Math.min(height - 1, sample.y));
                frame.x0 = Math.floor(sampleX);
                frame.y0 = Math.floor(sampleY);
                frame.x1 = Math.min(width - 1, frame.x0 + 1);
                frame.y1 = Math.min(height - 1, frame.y0 + 1);
                frame.fractionX = sampleX - frame.x0;
                frame.fractionY = sampleY - frame.y0;
                frame.samples = [];
            } else if (result) {
                frame.samples.push(result);
                result = null;
            }

            const sampled = /** @type {ImageRender.LiquifyFrame} */ (frame);

            if (sampled.samples.length < (sampled.restore >= 0 ? 1 : 4)) {
                const x = sampled.restore >= 0 ? sampled.x : sampled.samples.length % 2 ? sampled.x1 : sampled.x0;
                const y = sampled.restore >= 0 ? sampled.y : sampled.samples.length < 2 ? sampled.y0 : sampled.y1;
                const index = sampled.index - 1;
                stack.push({index: index, x: x, y: y});
                continue;
            }

            if (sampled.restore >= 0) {
                result = {x: Math.fround(sampled.samples[0].x * sampled.restore), y: Math.fround(sampled.samples[0].y * sampled.restore)};
            } else {
                const upperX = sampled.samples[0].x * (1 - sampled.fractionX) + sampled.samples[1].x * sampled.fractionX;
                const lowerX = sampled.samples[2].x * (1 - sampled.fractionX) + sampled.samples[3].x * sampled.fractionX;
                const upperY = sampled.samples[0].y * (1 - sampled.fractionX) + sampled.samples[1].y * sampled.fractionX;
                const lowerY = sampled.samples[2].y * (1 - sampled.fractionX) + sampled.samples[3].y * sampled.fractionX;
                result = {
                    x: Math.fround(sampled.sourceX - sampled.x + upperX * (1 - sampled.fractionY) + lowerX * sampled.fractionY),
                    y: Math.fround(sampled.sourceY - sampled.y + upperY * (1 - sampled.fractionY) + lowerY * sampled.fractionY)
                };
            }

            setLayerLiquifyCached(cache, sampled.index, sampled.y * width + sampled.x, result);
            stack.pop();
        }

        return /** @type {ImageRender.Point} */ (result);
    }

    /**
     * @param {ImageRender.LiquifyTile} tile
     * @param {ImageRender.LiquifyPoints} points
     * @param {number} index
     * @param {number} x
     * @param {number} y
     * @param {number} axis
     * @param {number} width
     * @param {number} height
     * @param {number} scaleX
     * @param {number} scaleY
     * @param {ImageRender.LiquifyCache} cache
     */
    function getLayerLiquifyField(tile, points, index, x, y, axis, width, height, scaleX, scaleY, cache) {
        if (!index) return 0;

        if (x >= tile.x && x < tile.x + tile.width && y >= tile.y && y < tile.y + tile.height) {
            return tile.field[((y - tile.y) * tile.width + x - tile.x) * 2 + axis];
        }

        const sample = getLayerLiquifyDisplacement(points, index - 1, x, y, width, height, scaleX, scaleY, cache);
        return axis ? sample.y : sample.x;
    }

    /**
     * @param {ImageRender.LiquifyTile} tile
     * @param {ImageRender.LiquifyPoint} point
     * @param {ImageRender.LiquifyPoints} points
     * @param {number} index
     * @param {number} width
     * @param {number} height
     * @param {number} scaleX
     * @param {number} scaleY
     * @param {ImageRender.LiquifyCache} cache
     */
    function renderLayerLiquifyPoint(tile, point, points, index, width, height, scaleX, scaleY, cache) {
        const left = Math.max(tile.x, point.left);
        const top = Math.max(tile.y, point.top);
        const right = Math.min(tile.x + tile.width - 1, point.right);
        const bottom = Math.min(tile.y + tile.height - 1, point.bottom);
        const brushWidth = right - left + 1;
        if (left > right || top > bottom) return;

        const sample = {x: 0, y: 0, restore: -1};

        for (let y = top; y <= bottom; y++) {
            for (let x = left; x <= right; x++) {
                const position = ((y - tile.y) * tile.width + x - tile.x) * 2;
                const offset = ((y - top) * brushWidth + x - left) * 2;
                tile.scratch[offset] = tile.field[position];
                tile.scratch[offset + 1] = tile.field[position + 1];
                if (!getLayerLiquifySample(point, x, y, scaleX, scaleY, sample)) continue;

                if (sample.restore >= 0) {
                    tile.scratch[offset] *= sample.restore;
                    tile.scratch[offset + 1] *= sample.restore;
                    continue;
                }

                // Compose inverse maps against the previous field, never against partially updated neighbors.
                const sampleX = Math.max(0, Math.min(width - 1, sample.x));
                const sampleY = Math.max(0, Math.min(height - 1, sample.y));
                const x0 = Math.floor(sampleX);
                const y0 = Math.floor(sampleY);
                const x1 = Math.min(width - 1, x0 + 1);
                const y1 = Math.min(height - 1, y0 + 1);
                const fractionX = sampleX - x0;
                const fractionY = sampleY - y0;

                for (let axis = 0; axis < 2; axis++) {
                    const upper = getLayerLiquifyField(tile, points, index, x0, y0, axis, width, height, scaleX, scaleY, cache) * (1 - fractionX) + getLayerLiquifyField(tile, points, index, x1, y0, axis, width, height, scaleX, scaleY, cache) * fractionX;
                    const lower = getLayerLiquifyField(tile, points, index, x0, y1, axis, width, height, scaleX, scaleY, cache) * (1 - fractionX) + getLayerLiquifyField(tile, points, index, x1, y1, axis, width, height, scaleX, scaleY, cache) * fractionX;
                    tile.scratch[offset + axis] = (axis ? sample.y - y : sample.x - x) + upper * (1 - fractionY) + lower * fractionY;
                }
            }
        }

        for (let y = top; y <= bottom; y++) {
            const offset = (y - top) * brushWidth * 2;
            tile.field.set(tile.scratch.subarray(offset, offset + brushWidth * 2), ((y - tile.y) * tile.width + left - tile.x) * 2);
        }
    }

    /**
     * @param {ImageInternal.LayerState} layer
     * @param {ImageInternal.LayerSource} source
     */
    function renderLayerRetouch(layer, source, scaleX = 1, scaleY = 1) {
        const retouch = /** @type {ImageTypes.ImageSerializedLayerRetouch} */ (layer.retouch);
        let width = "width" in source && typeof source.width === "number" ? source.width : NaN;
        let height = "height" in source && typeof source.height === "number" ? source.height : NaN;

        if ("naturalWidth" in source) {
            width = source.naturalWidth;
            height = source.naturalHeight;
        }

        if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;

        if (!layerRetouchCanvas) {
            layerRetouchCanvas = ownerDocument.createElement("canvas");
            layerRetouchStrokeCanvas = ownerDocument.createElement("canvas");

            const canvases = [layerRetouchCanvas, layerRetouchStrokeCanvas];
            cleanups.push(function () {
                for (const canvas of canvases) {
                    canvas.width = 0;
                    canvas.height = 0;
                }

                layerRetouchCanvas = null;
                layerRetouchStrokeCanvas = null;
            });
        }

        const strokeCanvas = /** @type {HTMLCanvasElement} */ (layerRetouchStrokeCanvas);

        for (const canvas of [layerRetouchCanvas, strokeCanvas]) {
            canvas.width = width;
            canvas.height = height;
        }

        const layerContext = layerRetouchCanvas.getContext("2d");
        const strokeContext = strokeCanvas.getContext("2d");
        if (!layerContext || !strokeContext) return null;

        layerContext.drawImage(source, 0, 0);

        for (let index = 0; index < retouch.historyIndex; index++) {
            const operation = retouch.operations[index];
            if (!operation.opacity) continue;

            const offsetX = (operation.points[0].x - operation.sourceX) * scaleX;
            const offsetY = (operation.points[0].y - operation.sourceY) * scaleY;
            if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) continue;

            strokeContext.globalCompositeOperation = "source-over";
            renderLayerMaskOperation(strokeContext, operation, scaleX, scaleY);
            strokeContext.globalCompositeOperation = "source-in";
            strokeContext.globalAlpha = 1;

            // Sample the completed layer before this stroke, with a fixed source-to-destination offset.
            strokeContext.drawImage(layerRetouchCanvas, offsetX, offsetY);
            applyLayerSelectionMask(strokeContext, getLayerSelectionMask(operation.selection, width, height, scaleX, scaleY));
            if (operation.type === "heal") renderLayerRetouchHeal(layerContext, strokeContext, operation, scaleX, scaleY);

            layerContext.globalAlpha = operation.opacity;
            layerContext.drawImage(strokeCanvas, 0, 0);
        }

        return layerRetouchCanvas;
    }

    /**
     * @param {CanvasRenderingContext2D} context
     * @param {CanvasRenderingContext2D} strokeContext
     * @param {ImageTypes.ImageLayerRetouchOperation} operation
     * @param {number} scaleX
     * @param {number} scaleY
     */
    function renderLayerRetouchHeal(context, strokeContext, operation, scaleX, scaleY) {
        const width = context.canvas.width;
        const height = context.canvas.height;
        const radius = operation.size / 2;
        let left = width;
        let top = height;
        let right = 0;
        let bottom = 0;

        for (const point of operation.points) {
            left = Math.max(0, Math.min(left, Math.floor((point.x - radius) * scaleX)));
            top = Math.max(0, Math.min(top, Math.floor((point.y - radius) * scaleY)));
            right = Math.min(width, Math.max(right, Math.ceil((point.x + radius) * scaleX)));
            bottom = Math.min(height, Math.max(bottom, Math.ceil((point.y + radius) * scaleY)));
        }

        if (left >= right || top >= bottom) return;

        const original = context.getImageData(left, top, right - left, bottom - top);
        const stroke = strokeContext.getImageData(left, top, right - left, bottom - top);
        let red = 0;
        let green = 0;
        let blue = 0;
        let total = 0;

        for (let index = 0; index < stroke.data.length; index += 4) {
            const weight = stroke.data[index + 3] * original.data[index + 3];
            red += (original.data[index] - stroke.data[index]) * weight;
            green += (original.data[index + 1] - stroke.data[index + 1]) * weight;
            blue += (original.data[index + 2] - stroke.data[index + 2]) * weight;
            total += weight;
        }

        if (!total) return;

        // Match the destination's mean color while retaining the sampled texture and alpha.
        for (let index = 0; index < stroke.data.length; index += 4) {
            if (!stroke.data[index + 3]) continue;

            stroke.data[index] += red / total;
            stroke.data[index + 1] += green / total;
            stroke.data[index + 2] += blue / total;
        }

        strokeContext.putImageData(stroke, left, top);
    }

    /**
     * @param {ImageInternal.LayerState} layer
     * @param {ImageInternal.LayerSource} source
     */
    function renderLayerPaint(layer, source, scaleX = 1, scaleY = 1) {
        const paint = /** @type {ImageTypes.ImageSerializedLayerPaint} */ (layer.paint);
        let width = "width" in source && typeof source.width === "number" ? source.width : NaN;
        let height = "height" in source && typeof source.height === "number" ? source.height : NaN;

        if ("naturalWidth" in source) {
            width = source.naturalWidth;
            height = source.naturalHeight;
        }

        if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;

        if (!layerPaintCanvas) {
            layerPaintCanvas = ownerDocument.createElement("canvas");
            layerPaintStrokeCanvas = ownerDocument.createElement("canvas");

            const canvases = [layerPaintCanvas, layerPaintStrokeCanvas];
            cleanups.push(function () {
                for (const canvas of canvases) {
                    canvas.width = 0;
                    canvas.height = 0;
                }

                layerPaintCanvas = null;
                layerPaintStrokeCanvas = null;
            });
        }

        const strokeCanvas = /** @type {HTMLCanvasElement} */ (layerPaintStrokeCanvas);

        for (const canvas of [layerPaintCanvas, strokeCanvas]) {
            canvas.width = width;
            canvas.height = height;
        }

        const layerContext = layerPaintCanvas.getContext("2d");
        const strokeContext = strokeCanvas.getContext("2d");
        if (!layerContext || !strokeContext) return null;

        layerContext.drawImage(source, 0, 0);

        for (let index = 0; index < paint.historyIndex; index++) {
            const operation = paint.operations[index];
            if (!operation.opacity) continue;

            const selectionMask = getLayerSelectionMask(operation.selection, width, height, scaleX, scaleY);

            if (operation.type === "gradient") {
                const context = selectionMask ? strokeContext : layerContext;

                if (selectionMask) {
                    context.globalCompositeOperation = "source-over";
                    context.clearRect(0, 0, width, height);
                }

                if (scaleX !== 1 || scaleY !== 1) context.scale(scaleX, scaleY);

                const gradient = context.createLinearGradient(operation.startX, operation.startY, operation.endX, operation.endY);
                gradient.addColorStop(0, operation.startColor);
                gradient.addColorStop(1, operation.endColor);
                context.fillStyle = gradient;
                context.globalAlpha = selectionMask ? 1 : operation.opacity;
                context.fillRect(0, 0, width / scaleX, height / scaleY);

                if (scaleX !== 1 || scaleY !== 1) context.setTransform(1, 0, 0, 1, 0, 0);

                if (selectionMask) {
                    applyLayerSelectionMask(strokeContext, selectionMask);
                    layerContext.globalAlpha = operation.opacity;
                    layerContext.drawImage(strokeCanvas, 0, 0);
                }

                continue;
            }

            strokeContext.globalCompositeOperation = "source-over";
            strokeContext.globalAlpha = 1;

            if (operation.type === "fill") {
                renderLayerPaintFill(layerContext, strokeContext, operation, selectionMask, scaleX, scaleY);
            } else if (operation.type === "pencil") {
                renderLayerMaskOperation(strokeContext, {
                    points: operation.points,
                    size: operation.size,
                    hardness: 1
                }, scaleX, scaleY);
            } else {
                renderLayerMaskOperation(strokeContext, operation, scaleX, scaleY);
            }

            applyLayerSelectionMask(strokeContext, selectionMask);
            strokeContext.globalCompositeOperation = "source-in";
            strokeContext.globalAlpha = 1;
            strokeContext.fillStyle = "black";
            strokeContext.fillStyle = operation.color;
            strokeContext.fillRect(0, 0, width, height);

            layerContext.globalAlpha = operation.opacity;
            layerContext.drawImage(strokeCanvas, 0, 0);
        }

        return layerPaintCanvas;
    }

    /**
     * @param {CanvasRenderingContext2D} context
     * @param {CanvasRenderingContext2D} strokeContext
     * @param {ImageTypes.ImageLayerPaintFillOperation} operation
     * @param {Uint8Array | null} selectionMask
     * @param {number} scaleX
     * @param {number} scaleY
     */
    function renderLayerPaintFill(context, strokeContext, operation, selectionMask, scaleX, scaleY) {
        const width = context.canvas.width;
        const height = context.canvas.height;
        const seedX = Math.floor(operation.x * scaleX);
        const seedY = Math.floor(operation.y * scaleY);

        strokeContext.clearRect(0, 0, width, height);
        if (seedX < 0 || seedY < 0 || seedX >= width || seedY >= height) return;
        if (selectionMask && !selectionMask[seedY * width + seedX]) return;

        const original = context.getImageData(0, 0, width, height);
        const stroke = strokeContext.createImageData(width, height);
        const seedOffset = (seedY * width + seedX) * 4;
        const seed = original.data.slice(seedOffset, seedOffset + 4);
        const tolerance = operation.tolerance * 255;
        const pending = [seedY * width + seedX];

        // Fill connected horizontal runs, comparing every pixel's RGBA channels with the unchanged seed.
        while (pending.length) {
            const pixel = /** @type {number} */ (pending.pop());
            const y = Math.floor(pixel / width);
            let x = pixel % width;
            let offset = pixel * 4;
            if (!isLayerPaintFillPixel(original.data, stroke.data, offset, seed, tolerance, selectionMask)) continue;

            while (x > 0 && isLayerPaintFillPixel(original.data, stroke.data, offset - 4, seed, tolerance, selectionMask)) {
                x--;
                offset -= 4;
            }

            /** @type {number | boolean} */
            let above = false;
            /** @type {number | boolean} */
            let below = false;

            for (; x < width && isLayerPaintFillPixel(original.data, stroke.data, offset, seed, tolerance, selectionMask); x++, offset += 4) {
                stroke.data[offset + 3] = 255;

                const matchesAbove = y > 0 && isLayerPaintFillPixel(original.data, stroke.data, offset - width * 4, seed, tolerance, selectionMask);
                const matchesBelow = y < height - 1 && isLayerPaintFillPixel(original.data, stroke.data, offset + width * 4, seed, tolerance, selectionMask);

                if (matchesAbove && !above) pending.push((y - 1) * width + x);
                if (matchesBelow && !below) pending.push((y + 1) * width + x);

                above = matchesAbove;
                below = matchesBelow;
            }
        }

        strokeContext.putImageData(stroke, 0, 0);
    }

    /**
     * @param {Uint8ClampedArray} data
     * @param {Uint8ClampedArray} stroke
     * @param {number} offset
     * @param {Uint8ClampedArray} seed
     * @param {number} tolerance
     * @param {Uint8Array | null} selectionMask
     */
    function isLayerPaintFillPixel(data, stroke, offset, seed, tolerance, selectionMask) {
        return (!selectionMask || selectionMask[offset / 4]) && !stroke[offset + 3] && Math.abs(data[offset] - seed[0]) <= tolerance && Math.abs(data[offset + 1] - seed[1]) <= tolerance && Math.abs(data[offset + 2] - seed[2]) <= tolerance && Math.abs(data[offset + 3] - seed[3]) <= tolerance;
    }

    /**
     * @param {ImageInternal.LayerState} layer
     * @param {ImageInternal.LayerSource} source
     */
    function renderLayerMask(layer, source, scaleX = 1, scaleY = 1) {
        const mask = /** @type {ImageTypes.ImageSerializedLayerMask} */ (layer.mask);
        let width = "width" in source && typeof source.width === "number" ? source.width : NaN;
        let height = "height" in source && typeof source.height === "number" ? source.height : NaN;

        if ("naturalWidth" in source) {
            width = source.naturalWidth;
            height = source.naturalHeight;
        }

        if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;

        if (!layerRenderCanvas) {
            layerRenderCanvas = ownerDocument.createElement("canvas");
            layerMaskCanvas = ownerDocument.createElement("canvas");
            layerMaskStrokeCanvas = ownerDocument.createElement("canvas");

            const canvases = [layerRenderCanvas, layerMaskCanvas, layerMaskStrokeCanvas];
            cleanups.push(function () {
                for (const canvas of canvases) {
                    canvas.width = 0;
                    canvas.height = 0;
                }

                layerRenderCanvas = null;
                layerMaskCanvas = null;
                layerMaskStrokeCanvas = null;
            });
        }

        const maskCanvas = /** @type {HTMLCanvasElement} */ (layerMaskCanvas);
        const strokeCanvas = /** @type {HTMLCanvasElement} */ (layerMaskStrokeCanvas);

        for (const canvas of [layerRenderCanvas, maskCanvas, strokeCanvas]) {
            canvas.width = width;
            canvas.height = height;
        }

        const layerContext = layerRenderCanvas.getContext("2d");
        const maskContext = maskCanvas.getContext("2d");
        const strokeContext = strokeCanvas.getContext("2d");
        if (!layerContext || !maskContext || !strokeContext) return null;

        layerContext.drawImage(source, 0, 0);
        maskContext.fillStyle = "white";
        maskContext.fillRect(0, 0, width, height);

        for (let index = 0; index < mask.operationIndex; index++) {
            const operation = mask.operations[index];
            if (!operation.opacity) continue;

            renderLayerMaskOperation(strokeContext, operation, scaleX, scaleY);
            applyLayerSelectionMask(strokeContext, getLayerSelectionMask(operation.selection, width, height, scaleX, scaleY));
            maskContext.globalCompositeOperation = operation.type === "erase" ? "destination-out" : "source-over";
            maskContext.globalAlpha = operation.opacity;
            maskContext.drawImage(strokeCanvas, 0, 0);
        }

        // The mask changes coverage only; restored pixels retain the original source's color and alpha.
        layerContext.globalCompositeOperation = "destination-in";
        layerContext.drawImage(maskCanvas, 0, 0);
        return layerRenderCanvas;
    }

    /**
     * @param {CanvasRenderingContext2D} context
     * @param {Pick<ImageTypes.ImageLayerMaskOperation, 'points' | 'size' | 'hardness'>} operation
     */
    function renderLayerMaskOperation(context, operation, scaleX = 1, scaleY = 1) {
        context.clearRect(0, 0, context.canvas.width, context.canvas.height);

        const radius = operation.size / 2;
        if (!radius) return;

        if (scaleX !== 1 || scaleY !== 1) context.scale(scaleX, scaleY);

        const steps = operation.hardness === 1 ? 1 : Math.max(2, Math.min(64, Math.ceil(radius * (1 - operation.hardness))));
        const first = operation.points[0];
        let hasSegments = false;

        context.fillStyle = "white";
        context.strokeStyle = "white";
        context.lineCap = "round";
        context.lineJoin = "round";
        context.beginPath();
        context.moveTo(first.x, first.y);

        for (let index = 1; index < operation.points.length; index++) {
            const point = operation.points[index];
            context.lineTo(point.x, point.y);
            if (point.x !== first.x || point.y !== first.y) hasSegments = true;
        }

        // Build the soft edge in bounded passes; stroke opacity is applied once to the complete footprint.
        for (let index = 0; index < steps; index++) {
            const size = operation.size * (1 - (1 - operation.hardness) * index / steps);
            context.globalAlpha = 1 / (steps - index);

            if (!hasSegments) {
                context.beginPath();
                context.arc(first.x, first.y, size / 2, 0, Math.PI * 2);
                context.fill();
            } else {
                context.lineWidth = size;
                context.stroke();
            }
        }

        if (scaleX !== 1 || scaleY !== 1) context.setTransform(1, 0, 0, 1, 0, 0);
    }

    // endregion

    // region ===== View State =========================================================================================
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let rotation = 0;
    let flipX = false;
    let flipY = false;
    let fitted = true; // true = the view is the auto-fit, not manual navigation (so rotation & resize keep it fitted)

    function getNaturalWidth() {
        return image.naturalWidth || 0;
    }

    function getNaturalHeight() {
        return image.naturalHeight || 0;
    }

    /** @returns {ImageInternal.ViewportSize} */
    function getViewportSize() {
        const rect = viewport.getBoundingClientRect();

        return {width: rect.width, height: rect.height, centerX: rect.left + rect.width / 2, centerY: rect.top + rect.height / 2};
    }

    // The axis-aligned bounding box of the image after rotation, at scale 1, used to fit the whole image.
    /** @param {number} canvasWidth @param {number} canvasHeight */
    function getRotatedBounds(canvasWidth, canvasHeight) {
        const radians = rotation * Math.PI / 180;
        const absCos = Math.abs(Math.cos(radians));
        const absSin = Math.abs(Math.sin(radians));

        return {
            width: canvasWidth * absCos + canvasHeight * absSin,
            height: canvasWidth * absSin + canvasHeight * absCos
        };
    }

    /** @param {number} canvasWidth @param {number} canvasHeight @param {ImageInternal.ViewportSize} viewportSize */
    function getFitScale(canvasWidth, canvasHeight, viewportSize) {
        if (!canvasWidth || !canvasHeight || !viewportSize.width || !viewportSize.height) return 1;

        const bounds = getRotatedBounds(canvasWidth, canvasHeight);

        return Math.min(viewportSize.width / bounds.width, viewportSize.height / bounds.height);
    }

    /** @param {number} canvasWidth @param {number} canvasHeight @param {ImageInternal.ViewportSize} viewportSize */
    function getFillScale(canvasWidth, canvasHeight, viewportSize) {
        if (!canvasWidth || !canvasHeight || !viewportSize.width || !viewportSize.height) return 1;

        const radians = rotation * Math.PI / 180;
        const cos = Math.abs(Math.cos(radians));
        const sin = Math.abs(Math.sin(radians));

        // Fit the viewport inside the canvas axes so rotation cannot expose its corners.
        return Math.max((viewportSize.width * cos + viewportSize.height * sin) / canvasWidth, (viewportSize.width * sin + viewportSize.height * cos) / canvasHeight);
    }

    /** @param {number} fitScale */
    function getMinScale(fitScale) {
        if (minZoom === "fit") return fitScale;

        return minZoom;
    }

    /** @param {number} fitScale */
    function getMaxScale(fitScale) {
        return Math.max(maxZoom, getMinScale(fitScale)); // never let the ceiling fall below the floor on a tiny viewport
    }

    /** @param {number} value */
    function clampScale(value) {
        const viewportSize = getViewportSize();
        const fitScale = getFitScale(getCanvasWidth(), getCanvasHeight(), viewportSize);

        return Math.max(getMinScale(fitScale), Math.min(value, getMaxScale(fitScale)));
    }

    /** @param {number} canvasWidth @param {number} canvasHeight @param {ImageInternal.ViewportSize} viewportSize */
    function getContainPanBounds(canvasWidth, canvasHeight, viewportSize) {
        const radians = rotation * Math.PI / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const viewportWidth = viewportSize.width * Math.abs(cos) + viewportSize.height * Math.abs(sin);
        const viewportHeight = viewportSize.width * Math.abs(sin) + viewportSize.height * Math.abs(cos);

        return {
            cos: cos,
            sin: sin,
            maxX: Math.max(0, (canvasWidth * scale - viewportWidth) / 2),
            maxY: Math.max(0, (canvasHeight * scale - viewportHeight) / 2)
        };
    }

    // Clamp against the image edges in its rotated axes; center axes too small to cover the viewport.
    function clampPan() {
        if (panBounds === "free") return;

        const bounds = getContainPanBounds(getCanvasWidth(), getCanvasHeight(), getViewportSize());
        const localX = offsetX * bounds.cos + offsetY * bounds.sin;
        const localY = offsetY * bounds.cos - offsetX * bounds.sin;
        const clampedX = Math.max(-bounds.maxX, Math.min(localX, bounds.maxX));
        const clampedY = Math.max(-bounds.maxY, Math.min(localY, bounds.maxY));
        if (clampedX === localX && clampedY === localY) return;

        offsetX = clampedX * bounds.cos - clampedY * bounds.sin;
        offsetY = clampedX * bounds.sin + clampedY * bounds.cos;
    }

    // Re-apply the fit for automatic views; preserve manual navigation within the current limits.
    function refitIfFitted() {
        if (fitted) {
            applyFit();
        } else {
            scale = clampScale(scale);
            clampPan();
        }
    }

    function getTransform() {
        const scaleX = flipX ? -scale : scale;
        const scaleY = flipY ? -scale : scale;

        return `translate(${roundTo(offsetX, 2)}px, ${roundTo(offsetY, 2)}px) rotate(${roundTo(rotation, 2)}deg) scale(${roundTo(scaleX, 4)}, ${roundTo(scaleY, 4)})`;
    }

    // endregion

    // region ===== Coordinate Conversion ==============================================================================
    /** @type {ImageTypes.ImageEngine["viewportToCanvas"]} */
    function viewportToCanvas(x, y) {
        const nextX = Number(x);
        const nextY = Number(y);

        if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
            throw new TypeError("createImage: viewport coordinates must be finite numbers.");
        }

        const viewportSize = getViewportSize();
        const scaleX = flipX ? -scale : scale;
        const scaleY = flipY ? -scale : scale;
        const radians = rotation * Math.PI / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const px = nextX - viewportSize.width / 2 - offsetX;
        const py = nextY - viewportSize.height / 2 - offsetY;

        return {
            x: getCanvasWidth() / 2 + (px * cos + py * sin) / scaleX,
            y: getCanvasHeight() / 2 + (py * cos - px * sin) / scaleY
        };
    }

    /** @type {ImageTypes.ImageEngine["canvasToViewport"]} */
    function canvasToViewport(x, y) {
        const nextX = Number(x);
        const nextY = Number(y);

        if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
            throw new TypeError("createImage: canvas coordinates must be finite numbers.");
        }

        const viewportSize = getViewportSize();
        const scaleX = flipX ? -scale : scale;
        const scaleY = flipY ? -scale : scale;
        const radians = rotation * Math.PI / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const px = (nextX - getCanvasWidth() / 2) * scaleX;
        const py = (nextY - getCanvasHeight() / 2) * scaleY;

        return {
            x: viewportSize.width / 2 + offsetX + px * cos - py * sin,
            y: viewportSize.height / 2 + offsetY + px * sin + py * cos
        };
    }

    /** @type {ImageTypes.ImageEngine["canvasToLayer"]} */
    function canvasToLayer(id, x, y) {
        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer) return false;

        const nextX = Number(x);
        const nextY = Number(y);

        if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
            throw new TypeError("createImage: canvas coordinates must be finite numbers.");
        }

        const transform = layer.transform;
        const scaleX = transform.flipX ? -transform.scaleX : transform.scaleX;
        const scaleY = transform.flipY ? -transform.scaleY : transform.scaleY;
        const radians = transform.rotation * Math.PI / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const px = nextX - transform.x;
        const py = nextY - transform.y;

        const point = {
            x: (px * cos + py * sin) / scaleX,
            y: (py * cos - px * sin) / scaleY
        };

        if (!transform.perspective) return point;

        const matrix = getLayerPerspectiveTransform(layer, true);
        if (!matrix) return false;

        return transformLayerPerspectivePoint(matrix, point.x, point.y);
    }

    /** @type {ImageTypes.ImageEngine["layerToCanvas"]} */
    function layerToCanvas(id, x, y) {
        const layer = layers.find(function (layer) {
            return layer.id === id;
        });
        if (!layer) return false;

        const nextX = Number(x);
        const nextY = Number(y);

        if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
            throw new TypeError("createImage: layer coordinates must be finite numbers.");
        }

        const transform = layer.transform;
        /** @type {{x: number, y: number} | false} */
        let point = {x: nextX, y: nextY};

        if (transform.perspective) {
            const matrix = getLayerPerspectiveTransform(layer);
            if (!matrix) return false;

            point = transformLayerPerspectivePoint(matrix, nextX, nextY);
            if (!point) return false;
        }

        const scaleX = transform.flipX ? -transform.scaleX : transform.scaleX;
        const scaleY = transform.flipY ? -transform.scaleY : transform.scaleY;
        const radians = transform.rotation * Math.PI / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const px = point.x * scaleX;
        const py = point.y * scaleY;

        return {
            x: transform.x + px * cos - py * sin,
            y: transform.y + px * sin + py * cos
        };
    }

    /** @param {ImageInternal.LayerState} layer @param {boolean} [inverse] @returns {number[] | null} */
    function getLayerPerspectiveTransform(layer, inverse = false) {
        const source = layer.source;
        if (typeof source === "string") return null;

        let width = "width" in source && typeof source.width === "number" ? source.width : NaN;
        let height = "height" in source && typeof source.height === "number" ? source.height : NaN;

        if ("naturalWidth" in source) {
            width = source.naturalWidth;
            height = source.naturalHeight;
        }

        if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;

        const {topLeft, topRight, bottomRight, bottomLeft} = /** @type {ImageTypes.ImageLayerPerspective} */ (layer.transform.perspective);
        const dx1 = topRight.x - bottomRight.x;
        const dx2 = bottomLeft.x - bottomRight.x;
        const dx3 = topLeft.x - topRight.x + bottomRight.x - bottomLeft.x;
        const dy1 = topRight.y - bottomRight.y;
        const dy2 = bottomLeft.y - bottomRight.y;
        const dy3 = topLeft.y - topRight.y + bottomRight.y - bottomLeft.y;
        let g = 0;
        let h = 0;

        if (dx3 || dy3) {
            const denominator = dx1 * dy2 - dx2 * dy1;
            if (!denominator || !Number.isFinite(denominator)) return null;

            g = (dx3 * dy2 - dx2 * dy3) / denominator;
            h = (dx1 * dy3 - dx3 * dy1) / denominator;
        }

        // Map the native source rectangle to the four local destination corners.
        const a = (topRight.x - topLeft.x + g * topRight.x) / width;
        const b = (bottomLeft.x - topLeft.x + h * bottomLeft.x) / height;
        const c = topLeft.x;
        const d = (topRight.y - topLeft.y + g * topRight.y) / width;
        const e = (bottomLeft.y - topLeft.y + h * bottomLeft.y) / height;
        const f = topLeft.y;
        g /= width;
        h /= height;

        const matrix = [a, b, c, d, e, f, g, h, 1];
        const determinant = a * (e - f * h) - b * (d - f * g) + c * (d * h - e * g);
        if (!matrix.every(function (value) {
            return Number.isFinite(value);
        }) || !Number.isFinite(determinant) || !determinant) return null;
        if (!inverse) return matrix;

        const result = [e - f * h, c * h - b, b * f - c * e, f * g - d, a - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d].map(function (value) {
            return value / determinant;
        });

        return result.every(function (value) {
            return Number.isFinite(value);
        }) ? result : null;
    }

    /** @param {number[]} matrix @param {number} x @param {number} y */
    function transformLayerPerspectivePoint(matrix, x, y) {
        const denominator = matrix[6] * x + matrix[7] * y + matrix[8];
        if (!denominator || !Number.isFinite(denominator)) return false;

        const nextX = (matrix[0] * x + matrix[1] * y + matrix[2]) / denominator;
        const nextY = (matrix[3] * x + matrix[4] * y + matrix[5]) / denominator;
        if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return false;

        return {x: nextX, y: nextY};
    }

    // endregion

    // region ===== Zoom Controls ======================================================================================
    /** @type {ImageTypes.ImageEngine["setZoom"]} */
    function setZoom(value) {
        if (destroyed) return false;

        return applyZoomAt(parseScale(value), 0, 0); // absolute scale, around the viewport centre
    }

    /** @type {ImageTypes.ImageEngine["zoomIn"]} */
    function zoomIn(factor = zoomStep) {
        if (destroyed) return false;

        return applyZoomAt(scale * parseZoomFactor(factor), 0, 0);
    }

    /** @type {ImageTypes.ImageEngine["zoomOut"]} */
    function zoomOut(factor = zoomStep) {
        if (destroyed) return false;

        return applyZoomAt(scale / parseZoomFactor(factor), 0, 0);
    }

    // Zoom to a scale while keeping the content under (clientX, clientY) fixed — the wheel/pinch behaviour.
    /** @type {ImageTypes.ImageEngine["zoomToPoint"]} */
    function zoomToPoint(value, clientX, clientY) {
        if (destroyed) return false;

        return applyZoomToPoint(value, clientX, clientY);
    }

    /** @param {number} value @param {number} clientX @param {number} clientY @param {boolean} [deferred] */
    function applyZoomToPoint(value, clientX, clientY, deferred = false) {
        const viewportSize = getViewportSize();
        const px = Number(clientX) - viewportSize.centerX;
        const py = Number(clientY) - viewportSize.centerY;
        if (!Number.isFinite(px) || !Number.isFinite(py)) return false;

        return applyZoomAt(parseScale(value), px, py, deferred);
    }

    // Scale around a viewport-relative point, then follow any pinch midpoint movement before clamping.
    /** @param {number} nextScale @param {number} px @param {number} py @param {boolean} [deferred] @param {number} [deltaX] @param {number} [deltaY] */
    function applyZoomAt(nextScale, px, py, deferred = false, deltaX = 0, deltaY = 0) {
        const clamped = clampScale(nextScale);
        const scaleChanged = Math.abs(clamped - scale) >= 0.00001;
        if (!scaleChanged && !deltaX && !deltaY) return false;

        const previousX = offsetX;
        const previousY = offsetY;
        const ratio = scaleChanged ? clamped / scale : 1;
        offsetX = px - (px - offsetX) * ratio + deltaX;
        offsetY = py - (py - offsetY) * ratio + deltaY;
        if (scaleChanged) scale = clamped;
        clampPan();
        if (!scaleChanged && offsetX === previousX && offsetY === previousY) return false;

        fitted = false;
        if (deferred) {
            notifyFrame();
        } else {
            notify();
        }
        return true;
    }

    /** @param {number} value */
    function parseScale(value) {
        const next = Number(value);

        if (!Number.isFinite(next) || next <= 0) {
            throw new TypeError("createImage: zoom scale must be a positive number.");
        }

        return next;
    }

    /** @param {number} value */
    function parseZoomFactor(value) {
        const factor = Number(value);

        if (!Number.isFinite(factor) || factor <= 0) {
            throw new TypeError("createImage: the zoom factor must be a positive number.");
        }

        return factor;
    }

    // endregion

    // region ===== Fit Controls =======================================================================================
    let fitModeState = fitMode; // the live fit mode; the `fitMode` config is only the initial value

    // Set the view to the current fit mode: contain fits the whole image, cover fills, actual is 1:1. Recenters.
    function applyFit() {
        const canvasWidth = getCanvasWidth();
        const canvasHeight = getCanvasHeight();
        const viewportSize = getViewportSize();

        if (fitModeState === "actual") {
            scale = clampScale(1);
        } else if (fitModeState === "cover") {
            scale = clampScale(getFillScale(canvasWidth, canvasHeight, viewportSize));
        } else {
            scale = clampScale(getFitScale(canvasWidth, canvasHeight, viewportSize));
        }

        offsetX = 0;
        offsetY = 0;
        fitted = true;
    }

    /** @type {ImageTypes.ImageEngine["setFitMode"]} */
    function setFitMode(mode) {
        if (destroyed) return false;

        if (!["contain", "cover", "actual"].includes(mode)) {
            throw new TypeError("createImage: fit mode must be 'contain', 'cover', or 'actual'.");
        }

        const previousMode = fitModeState;
        const previousScale = scale;
        const previousX = offsetX;
        const previousY = offsetY;

        fitModeState = mode;
        applyFit();
        if (fitModeState !== previousMode || scale !== previousScale || offsetX !== previousX || offsetY !== previousY) notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine["actualSize"]} */
    function actualSize() {
        if (destroyed) return false;

        return applyZoomAt(1, 0, 0);
    }

    // Reset the whole view — fit, no rotation, no flip, centred. The keyboard "0" / start-over action.
    /** @type {ImageTypes.ImageEngine["reset"]} */
    function reset() {
        if (destroyed) return false;

        const previousRotation = rotation;
        const previousFlipX = flipX;
        const previousFlipY = flipY;
        const previousScale = scale;
        const previousX = offsetX;
        const previousY = offsetY;

        rotation = 0;
        flipX = false;
        flipY = false;
        applyFit();
        if (rotation !== previousRotation || flipX !== previousFlipX || flipY !== previousFlipY || scale !== previousScale || offsetX !== previousX || offsetY !== previousY) notify();
        return true;
    }

    function getFitMode() {
        return fitModeState;
    }

    function isFitted() {
        const fitScale = getFitScale(getCanvasWidth(), getCanvasHeight(), getViewportSize());

        return Math.abs(scale - fitScale) < 0.0001;
    }

    function isActualSize() {
        return Math.abs(scale - 1) < 0.0001;
    }

    function isZoomed() {
        return !isFitted();
    }

    // endregion

    // region ===== Pan Controls =======================================================================================
    /** @type {ImageTypes.ImageEngine["setPan"]} */
    function setPan(x, y) {
        if (destroyed) return false;

        const nextX = Number(x);
        const nextY = Number(y);

        if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
            throw new TypeError("createImage: pan offsets must be finite numbers.");
        }

        const previousX = offsetX;
        const previousY = offsetY;

        offsetX = nextX;
        offsetY = nextY;
        clampPan();
        if (offsetX !== previousX || offsetY !== previousY) {
            fitted = false;
            notify();
        }
        return true;
    }

    // Shift the pan by a screen-space delta (used by drag and the arrow keys). Returns whether anything moved.
    /** @param {number} deltaX @param {number} deltaY */
    function panScreenBy(deltaX, deltaY) {
        const beforeX = offsetX;
        const beforeY = offsetY;

        offsetX += deltaX;
        offsetY += deltaY;
        clampPan();

        if (offsetX === beforeX && offsetY === beforeY) return false;

        fitted = false;
        notifyFrame();
        return true;
    }

    // endregion

    // region ===== Rotation Controls ==================================================================================
    /** @type {ImageTypes.ImageEngine["setRotation"]} */
    function setRotation(degrees) {
        if (destroyed) return false;

        const next = Number(degrees);

        if (!Number.isFinite(next)) {
            throw new TypeError("createImage: rotation must be a finite number of degrees.");
        }

        const previousRotation = rotation;
        const previousScale = scale;
        const previousX = offsetX;
        const previousY = offsetY;

        rotation = ((next % 360) + 360) % 360; // normalise into [0, 360)
        refitIfFitted(); // preserve the current view within the limits of the rotated bounds
        if (rotation !== previousRotation || scale !== previousScale || offsetX !== previousX || offsetY !== previousY) notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine["rotateClockwise"]} */
    function rotateClockwise() {
        if (destroyed) return false;

        return setRotation(rotation + rotationStep);
    }

    /** @type {ImageTypes.ImageEngine["rotateCounterClockwise"]} */
    function rotateCounterClockwise() {
        if (destroyed) return false;

        return setRotation(rotation - rotationStep);
    }

    // endregion

    // region ===== Flip Controls ======================================================================================
    /** @type {ImageTypes.ImageEngine["setFlipHorizontal"]} */
    function setFlipHorizontal(enabled) {
        if (destroyed) return false;

        if (typeof enabled !== "boolean") {
            throw new TypeError("createImage: flip must be a boolean.");
        }

        if (flipX === enabled) return true;

        flipX = enabled;
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine["setFlipVertical"]} */
    function setFlipVertical(enabled) {
        if (destroyed) return false;

        if (typeof enabled !== "boolean") {
            throw new TypeError("createImage: flip must be a boolean.");
        }

        if (flipY === enabled) return true;

        flipY = enabled;
        notify();
        return true;
    }

    /** @type {ImageTypes.ImageEngine["toggleFlipHorizontal"]} */
    function toggleFlipHorizontal() {
        return setFlipHorizontal(!flipX);
    }

    /** @type {ImageTypes.ImageEngine["toggleFlipVertical"]} */
    function toggleFlipVertical() {
        return setFlipVertical(!flipY);
    }

    // endregion

    // region ===== Fullscreen Controls ================================================================================
    let fullscreenActive = isFullscreenActive();

    function handleFullscreenChange() {
        if (destroyed) return;

        const active = isFullscreenActive();
        if (fullscreenActive === active) return;

        fullscreenActive = active;
        notify();
    }

    function isFullscreenSupported() {
        return Boolean(viewport.requestFullscreen || viewport.webkitRequestFullscreen);
    }

    function getFullscreenElement() {
        // The document retargets fullscreen elements inside Shadow DOM to their host.
        const root = viewport.getRootNode?.();
        const fullscreenElement = root && "fullscreenElement" in root ? root.fullscreenElement : null;

        return fullscreenElement || ownerDocument.fullscreenElement || ownerDocument.webkitFullscreenElement || null;
    }

    function isFullscreenActive() {
        return getFullscreenElement() === viewport;
    }

    /** @type {ImageTypes.ImageEngine["enterFullscreen"]} */
    async function enterFullscreen() {
        if (destroyed) return false;
        if (!isFullscreenSupported()) return false;
        if (isFullscreenActive()) return true;

        try {
            if (viewport.requestFullscreen) {
                await viewport.requestFullscreen();
            } else if (viewport.webkitRequestFullscreen) {
                await viewport.webkitRequestFullscreen();
            } else {
                return false;
            }
        } catch {
            return false;
        }

        if (destroyed) return false;

        handleFullscreenChange();
        return true;
    }

    /** @type {ImageTypes.ImageEngine["exitFullscreen"]} */
    async function exitFullscreen() {
        if (destroyed) return false;
        if (!isFullscreenActive()) return true;

        try {
            if (ownerDocument.exitFullscreen) {
                await ownerDocument.exitFullscreen();
            } else if (ownerDocument.webkitExitFullscreen) {
                await ownerDocument.webkitExitFullscreen();
            } else {
                return false;
            }
        } catch {
            return false;
        }

        if (destroyed) return false;

        handleFullscreenChange();
        return true;
    }

    /** @type {ImageTypes.ImageEngine["toggleFullscreen"]} */
    function toggleFullscreen() {
        if (isFullscreenActive()) {
            void exitFullscreen();
        } else {
            void enterFullscreen();
        }
    }

    // endregion

    // region ===== Sources ============================================================================================
    let loaded = false;
    let hasError = false;
    let errorMessage = "";
    let loadedSource = "";
    let loadedWidth = 0;
    let loadedHeight = 0;

    function getSource() {
        return image.currentSrc || image.src || "";
    }

    function isLoading() {
        return Boolean(getSource()) && !loaded && !hasError;
    }

    function isLoaded() {
        return loaded;
    }

    /** @param {string} nextSource */
    function applySource(nextSource) {
        loaded = false;
        hasError = false;
        errorMessage = "";
        image.src = nextSource;
    }

    /** @type {ImageTypes.ImageEngine["retry"]} */
    function retry() {
        if (destroyed) return false;

        const currentSource = image.getAttribute("src");
        if (!currentSource) return false;

        const changed = loaded || hasError;

        applySource(currentSource); // re-assign the src to re-run the load cycle
        if (changed) notify();
        return true;
    }

    // endregion

    // region ===== Pointer Controls ===================================================================================
    const doubleTapDelay = 300;
    const tapMoveTolerance = 8; // px of movement below which a press still counts as a tap, not a drag
    /** @type {Map<number, {x: number, y: number}>} */
    const activePointers = new Map(); // pointerId → last client position, so drag/pinch can measure deltas
    let pinchDistance = 0; // distance between the two pinch pointers on the previous move
    let pointerMoved = false; // whether the gesture has moved beyond the tap tolerance
    /** @type {{x: number, y: number} | null} */
    let pointerDownPosition = null; // where a single-pointer press started, for tap detection
    /** @type {{x: number, y: number, time: number} | null} */
    let lastTap = null; // the previous tap, for double-tap detection

    /** @param {DragEvent} event */
    function handleImageDragStart(event) {
        if (destroyed || activePointers.size !== 1 || !isDragPanEnabled()) return;
        if (!canPan(getCanvasWidth(), getCanvasHeight(), getViewportSize())) return;

        event.preventDefault(); // keep native image dragging from cancelling the active pan
    }

    /** @param {PointerEvent} event */
    function handlePointerDown(event) {
        if (destroyed) return;
        if (event.defaultPrevented || (event.pointerType === "mouse" && event.button !== 0) || (!isDragPanEnabled() && !isPinchZoomEnabled() && !isDoubleClickZoomEnabled())) {
            lastTap = null;
            pointerDownPosition = null;
            return;
        }

        // Preserve clicks and editing on controls, including their nested text and icons.
        for (const target of event.composedPath()) {
            if (target === viewport) break;

            const element = /** @type {HTMLElement} */ (target);
            if (element.isContentEditable || ["BUTTON", "A", "LABEL", "INPUT", "SELECT", "TEXTAREA", "SUMMARY"].includes(element.tagName?.toUpperCase())) {
                lastTap = null;
                pointerDownPosition = null;
                return;
            }
        }

        activePointers.set(event.pointerId, {x: event.clientX, y: event.clientY});

        if (activePointers.size === 1) {
            pointerMoved = false;
            pointerDownPosition = {x: event.clientX, y: event.clientY};
        }

        if (activePointers.size === 2) {
            lastTap = null;
            pinchDistance = getPinchDistance();
        }

        if (typeof viewport.setPointerCapture === "function") {
            try {
                viewport.setPointerCapture(event.pointerId);
            } catch {
            }
        }
    }

    /** @param {PointerEvent} event */
    function handlePointerMove(event) {
        if (destroyed) return;

        const pointer = activePointers.get(event.pointerId);
        if (!pointer) return;

        const previousMidpoint = activePointers.size === 2 ? getPinchMidpoint() : null;
        const deltaX = event.clientX - pointer.x;
        const deltaY = event.clientY - pointer.y;
        pointer.x = event.clientX;
        pointer.y = event.clientY;

        if (pointerDownPosition && (Math.abs(event.clientX - pointerDownPosition.x) > tapMoveTolerance || Math.abs(event.clientY - pointerDownPosition.y) > tapMoveTolerance)) {
            pointerMoved = true;
            lastTap = null;
        }

        // Two pointers: pinch-zoom around the midpoint.
        if (activePointers.size === 2) {
            if (!isPinchZoomEnabled()) return;

            const nextDistance = getPinchDistance();

            if (previousMidpoint && pinchDistance > 0 && nextDistance > 0) {
                const midpoint = getPinchMidpoint();
                const viewportSize = getViewportSize();
                applyZoomAt(
                    scale * (nextDistance / pinchDistance),
                    previousMidpoint.x - viewportSize.centerX,
                    previousMidpoint.y - viewportSize.centerY,
                    true,
                    midpoint.x - previousMidpoint.x,
                    midpoint.y - previousMidpoint.y
                );
            }

            pinchDistance = nextDistance;
            event.preventDefault();
            return;
        }

        // One pointer: drag to pan, only while there's overflow to move within.
        if (activePointers.size === 1 && isDragPanEnabled() && canPan(getCanvasWidth(), getCanvasHeight(), getViewportSize())) {
            panScreenBy(deltaX, deltaY);
            event.preventDefault();
        }
    }

    /** @param {PointerEvent} event */
    function handlePointerUp(event) {
        if (destroyed || !activePointers.has(event.pointerId)) return;
        if (event.type === "lostpointercapture" && event.target !== viewport) return;

        const wasSinglePointer = activePointers.size === 1;
        activePointers.delete(event.pointerId);

        pinchDistance = activePointers.size === 2 ? getPinchDistance() : 0;

        if (event.type !== "lostpointercapture" && typeof viewport.releasePointerCapture === "function") {
            try {
                viewport.releasePointerCapture(event.pointerId);
            } catch {
            }
        }

        // Cancellation interrupts the tap sequence; only a completed, unmoved press can count as a tap.
        if (event.type !== "pointerup") {
            lastTap = null;
        } else if (wasSinglePointer && !pointerMoved && pointerDownPosition) {
            handleTap(event.clientX, event.clientY);
        }

        pointerDownPosition = null;
    }

    /** @param {number} clientX @param {number} clientY */
    function handleTap(clientX, clientY) {
        if (!isDoubleClickZoomEnabled()) {
            lastTap = null;
            return;
        }

        const now = Date.now();

        if (lastTap && now - lastTap.time <= doubleTapDelay && Math.abs(clientX - lastTap.x) <= tapMoveTolerance * 3 && Math.abs(clientY - lastTap.y) <= tapMoveTolerance * 3) {
            lastTap = null;
            toggleZoomAt(clientX, clientY); // double-tap: toggle fit ⇄ actual at the tapped point
            return;
        }

        lastTap = {x: clientX, y: clientY, time: now};
    }

    // Double-click/tap: when not at actual size, jump to 1:1 at the point; otherwise drop back to fit.
    /** @param {number} clientX @param {number} clientY */
    function toggleZoomAt(clientX, clientY) {
        if (isActualSize()) {
            setFitMode("contain");
            return;
        }

        zoomToPoint(1, clientX, clientY);
    }

    /** @param {WheelEvent} event */
    function handleWheel(event) {
        if (destroyed || !isWheelZoomEnabled()) return;
        if (event.deltaY === 0) return;

        event.preventDefault();

        const direction = event.deltaY < 0 ? 1 : -1;
        applyZoomToPoint(scale * Math.pow(zoomStep, direction), event.clientX, event.clientY, true);
    }

    function getPinchDistance() {
        const points = Array.from(activePointers.values());
        if (points.length < 2) return 0;

        return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    }

    function getPinchMidpoint() {
        const points = Array.from(activePointers.values());

        return {x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2};
    }

    function isWheelZoomEnabled() {
        return wheelZoom;
    }

    function isDragPanEnabled() {
        return dragPan;
    }

    function isPinchZoomEnabled() {
        return pinchZoom;
    }

    function isDoubleClickZoomEnabled() {
        return doubleClickZoom;
    }

    // endregion

    // region ===== Keyboard Shortcuts =================================================================================
    let keyboardShortcutsEnabled = keyboardShortcuts;

    /** @type {ImageTypes.ImageEngine["setKeyboardShortcuts"]} */
    function setKeyboardShortcuts(enabled) {
        if (destroyed) return false;

        if (typeof enabled !== "boolean") {
            throw new TypeError("createImage: keyboard shortcuts must be a boolean.");
        }

        if (isKeyboardShortcutsEnabled() === enabled) return true;

        keyboardShortcutsEnabled = enabled;
        return true;
    }

    function isKeyboardShortcutsEnabled() {
        return keyboardShortcutsEnabled;
    }

    /** @type {ImageTypes.ImageEngine["listKeyboardShortcuts"]} */
    function listKeyboardShortcuts() {
        return [
            {id: "zoom-in", keys: ["+", "="], message: "Zoom in"},
            {id: "zoom-out", keys: ["-"], message: "Zoom out"},
            {id: "rotate-clockwise", keys: ["r"], message: "Rotate clockwise"},
            {id: "rotate-counter-clockwise", keys: ["R"], message: "Rotate counter-clockwise"},
            {id: "toggle-fullscreen", keys: ["f"], message: "Enter or exit fullscreen"},
            {id: "reset", keys: ["0"], message: "Reset the view"}
        ];
    }

    /** @param {KeyboardEvent} event */
    function handleKeyboardShortcut(event) {
        if (destroyed || !isKeyboardShortcutsEnabled()) return;
        if (shouldIgnoreKeyboardShortcut(event)) return;

        if (event.key === "+" || event.key === "=") {
            zoomIn();
            event.preventDefault();
            return;
        }

        if (event.key === "-") {
            zoomOut();
            event.preventDefault();
            return;
        }

        if (event.key === "r") {
            rotateClockwise();
            event.preventDefault();
            return;
        }

        if (event.key === "R") {
            rotateCounterClockwise();
            event.preventDefault();
            return;
        }

        if (event.key === "f") {
            toggleFullscreen();
            event.preventDefault();
            return;
        }

        if (event.key === "0") {
            reset();
            event.preventDefault();
        }
    }

    /** @param {KeyboardEvent} event */
    function shouldIgnoreKeyboardShortcut(event) {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return true;

        // Shadow DOM retargets event.target to the host; the composed path still identifies editable controls.
        for (const target of event.composedPath()) {
            const element = /** @type {HTMLElement} */ (target);
            if (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(element.tagName?.toUpperCase())) return true;
            if (target === viewport) break;
        }

        return false;
    }

    // endregion

    // region ===== Tear Down ==========================================================================================
    /** @type {ImageTypes.ImageEngine["destroy"]} */
    function destroy() {
        if (destroyed) return;

        destroyed = true; // make future work and future destroy calls harmless

        cleanups.forEach(function (cleanup) {
            cleanup();
        });

        cleanups.length = 0; // release references to the cleanup functions and their event targets
        notifier.destroy();
        subscriptions.clear();
        cachedDocumentSnapshot = null;
        cachedDocumentRevision = -1;
        cachedOperationSnapshots = new WeakMap();
        lastNotificationState = null;
    }

    // endregion

    init();

    return {
        getState,
        subscribe,
        retry,
        setCanvasSize,
        resizeDocument,
        setCanvasBackground,
        addLayer,
        resolveLayerSource,
        removeLayer,
        rasterizeLayer,
        setLayerVisibility,
        setLayerOpacity,
        setLayerTransform,
        resizeLayer,
        setLayerPerspective,
        clearLayerPerspective,
        createLayerMask,
        removeLayerMask,
        setLayerMaskEnabled,
        addLayerMaskOperation,
        undoLayerMask,
        redoLayerMask,
        canUndoLayerMask,
        canRedoLayerMask,
        createLayerAdjustments,
        removeLayerAdjustments,
        setLayerAdjustment,
        setLayerAdjustmentsEnabled,
        createLayerLiquify,
        removeLayerLiquify,
        setLayerLiquifyEnabled,
        addLayerLiquifyOperation,
        undoLayerLiquify,
        redoLayerLiquify,
        canUndoLayerLiquify,
        canRedoLayerLiquify,
        createLayerPaint,
        removeLayerPaint,
        setLayerPaintEnabled,
        addLayerPaintOperation,
        undoLayerPaint,
        redoLayerPaint,
        canUndoLayerPaint,
        canRedoLayerPaint,
        createLayerRetouch,
        removeLayerRetouch,
        setLayerRetouchEnabled,
        addLayerRetouchOperation,
        undoLayerRetouch,
        redoLayerRetouch,
        canUndoLayerRetouch,
        canRedoLayerRetouch,
        moveLayer,
        setSelection,
        clearSelection,
        setCrop,
        clearCrop,
        setStraighten,
        resetStraighten,
        undo,
        redo,
        canUndo,
        canRedo,
        beginTransaction,
        commitTransaction,
        cancelTransaction,
        serialize,
        load,
        render,
        renderPreview,
        exportImage,
        pickColor,
        viewportToCanvas,
        canvasToViewport,
        canvasToLayer,
        layerToCanvas,
        setZoom,
        zoomIn,
        zoomOut,
        zoomToPoint,
        setFitMode,
        actualSize,
        reset,
        setPan,
        setRotation,
        rotateClockwise,
        rotateCounterClockwise,
        setFlipHorizontal,
        setFlipVertical,
        toggleFlipHorizontal,
        toggleFlipVertical,
        enterFullscreen,
        exitFullscreen,
        toggleFullscreen,
        setKeyboardShortcuts,
        listKeyboardShortcuts,
        destroy
    };
}
