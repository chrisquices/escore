import {createNotifier, createErrorReporter} from 'strata-packages/ui-interactions/internal/core';

export type DraggableAxis = "both" | "x" | "y"
export type DraggableBounds =
    | "none"
    | "parent"
    | "viewport"
    | HTMLElement
    | {top: number; left: number; right: number; bottom: number}
export type DraggableResizeSide = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"

export interface DraggableState {
    x: number
    y: number
    dragging: boolean
    axis: DraggableAxis
    disabled: boolean
    canDrag: boolean
    boundsMode: "none" | "parent" | "viewport" | "custom"
    resizable: boolean
    resizing: boolean
    resizeSide: DraggableResizeSide | null
    width: number
    height: number
    canResize: boolean
    cursor: string
    transform: string
}

export interface DraggableError {
    id: string
    message: string
    metadata: unknown
}

export interface DraggableConfig {
    onChange?: (state: DraggableState) => void
    onError?: (error: DraggableError) => void
    handle?: string | HTMLElement | null
    axis?: DraggableAxis
    bounds?: DraggableBounds
    threshold?: number
    disabled?: boolean
    resizable?: boolean
    resizeHandles?: DraggableResizeSide[]
    minWidth?: number
    minHeight?: number
    maxWidth?: number
    maxHeight?: number
    aspectRatio?: "auto" | number | null
    resizeEdgeSize?: number
}

export interface DraggableEngine {
    getState(): DraggableState
    subscribe(listener: (state: DraggableState) => void): () => void
    setPosition(x: number, y: number): void
    reset(): void
    setDisabled(value: boolean): void
    setSize(width: number, height: number): void
    destroy(): void
}

function isValidBounds(value: unknown) {
    if (value === "none" || value === "parent" || value === "viewport") {
        return true;
    }

    if (value && typeof value === "object" && "getBoundingClientRect" in value && typeof value.getBoundingClientRect === "function") {
        return true;
    }

    if (value && typeof value === "object" && ["top", "left", "right", "bottom"].every(function (key) {
        return typeof (value as Record<string, unknown>)[key] === "number";
    })) {
        return true;
    }

    return false;
}

function roundTo(value: number, places: number) {
    const factor = Math.pow(10, places);

    return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function detectResizeSide(rect: DOMRect, clientX: number, clientY: number, edge: number, allowed: DraggableResizeSide[]) {
    const vertical = clientY - rect.top <= edge ? "n" : rect.bottom - clientY <= edge ? "s" : "";
    const horizontal = clientX - rect.left <= edge ? "w" : rect.right - clientX <= edge ? "e" : "";
    const side = (vertical + horizontal) as DraggableResizeSide;

    return side && allowed.includes(side) ? side : null;
}

function resizeCursor(side: string) {
    if (side === "n" || side === "s") return "ns-resize";
    if (side === "e" || side === "w") return "ew-resize";
    if (side === "ne" || side === "sw") return "nesw-resize";
    if (side === "nw" || side === "se") return "nwse-resize";

    return "";
}

export function createDraggable(element: HTMLElement, config: DraggableConfig = {}): DraggableEngine {
    if (!element || typeof element.addEventListener !== "function" || typeof element.getBoundingClientRect !== "function" || !("ownerDocument" in element)) {
        throw new TypeError("createDraggable: 'element' must be a DOM element.");
    }

    // region ===== Config =============================================================================================
    const {
        onChange, onError,
        handle = null,
        axis = "both",
        bounds = "none",
        threshold = 5,
        disabled = false,
        resizable = false,
        resizeHandles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"],
        minWidth = 0,
        minHeight = 0,
        maxWidth = Infinity,
        maxHeight = Infinity,
        aspectRatio = null,
        resizeEdgeSize = 12
    } = config;

    validateConfig();

    function validateConfig() {

        // On Change
        if (onChange !== undefined && typeof onChange !== "function") {
            throw new TypeError("createDraggable: the 'onChange' option must be a function when provided.");
        }

        // On Error
        if (onError !== undefined && typeof onError !== "function") {
            throw new TypeError("createDraggable: the 'onError' option must be a function when provided.");
        }

        // Handle — restricts the grab zone to a sub-element (CSS selector or element); null = the whole element.
        if (handle !== null && typeof handle !== "string" && typeof handle.addEventListener !== "function") {
            throw new TypeError("createDraggable: the 'handle' option must be null, a CSS selector string, or a DOM element.");
        }

        // Axis
        if (!["both", "x", "y"].includes(axis)) {
            throw new TypeError("createDraggable: the 'axis' option must be 'both', 'x', or 'y'.");
        }

        // Bounds — where the element may move: 'none' | 'parent' | 'viewport' | an element | a rect.
        if (!isValidBounds(bounds)) {
            throw new TypeError("createDraggable: the 'bounds' option must be 'none', 'parent', 'viewport', a DOM element, or a rect.");
        }

        // Threshold
        if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold < 0) {
            throw new TypeError("createDraggable: the 'threshold' option must be a number >= 0.");
        }

        // Disabled
        if (typeof disabled !== "boolean") {
            throw new TypeError("createDraggable: the 'disabled' option must be a boolean.");
        }

        // Resizable
        if (typeof resizable !== "boolean") {
            throw new TypeError("createDraggable: the 'resizable' option must be a boolean.");
        }

        // Resize Handles — any of the eight compass sides
        if (!Array.isArray(resizeHandles) || !resizeHandles.every(function (side) {
            return ["nw", "n", "ne", "e", "se", "s", "sw", "w"].includes(side);
        })) {
            throw new TypeError("createDraggable: the 'resizeHandles' option must be an array of 'nw','n','ne','e','se','s','sw','w'.");
        }

        // Min Size
        if (!Number.isFinite(minWidth) || minWidth < 0 || !Number.isFinite(minHeight) || minHeight < 0) {
            throw new TypeError("createDraggable: the 'minWidth' and 'minHeight' options must be numbers >= 0.");
        }

        // Max Size — a number >= 0, or Infinity for "no cap"
        if ((maxWidth !== Infinity && (!Number.isFinite(maxWidth) || maxWidth < 0)) || (maxHeight !== Infinity && (!Number.isFinite(maxHeight) || maxHeight < 0))) {
            throw new TypeError("createDraggable: the 'maxWidth' and 'maxHeight' options must be numbers >= 0 (or Infinity).");
        }

        if (minWidth > maxWidth || minHeight > maxHeight) {
            throw new TypeError("createDraggable: 'minWidth'/'minHeight' cannot exceed 'maxWidth'/'maxHeight'.");
        }

        // Aspect Ratio — null (free), "auto" (lock to the element's own ratio), or a positive number (e.g. 16/9)
        if (aspectRatio !== null && aspectRatio !== "auto" && (typeof aspectRatio !== "number" || !Number.isFinite(aspectRatio) || aspectRatio <= 0)) {
            throw new TypeError("createDraggable: the 'aspectRatio' option must be null, 'auto', or a positive number.");
        }

        // Resize Edge Size — how many px from the border count as a resize zone
        if (!Number.isFinite(resizeEdgeSize) || resizeEdgeSize <= 0) {
            throw new TypeError("createDraggable: the 'resizeEdgeSize' option must be a number > 0.");
        }
    }

    // endregion

    // region ===== Init ===============================================================================================
    const ownerDocument = element.ownerDocument; // the element's own document, so reads work across realms/iframes
    const defaultView = ownerDocument.defaultView!; // the window: for viewport bounds, RAF, and ResizeObserver later
    const handleElement = resolveHandle(); // the sub-element that starts a drag, or the element itself
    let destroyed = false; // late pointer/RAF/resize events must not still fire callbacks after teardown

    function init() {

        // Wire up subscribers and listeners first, so nothing that follows goes unheard
        if (onChange) subscribe(onChange);

        registerAllEventListeners();

        // When resizable, seed the size from the element's starting box so getState can report it
        if (resizable) captureSize();

        // Emit the initial state so the consumer can render the starting position
        notify();
    }

    function resolveHandle() {
        if (handle === null) return element;
        if (typeof handle === "string") return element.querySelector(handle) || element;

        return handle;
    }

    // endregion

    // region ===== Event Listeners ====================================================================================
    const cleanups: (() => void)[] = []; // teardown functions, collected so everything can be undone at once

    function registerEventListener<K extends keyof HTMLElementEventMap>(target: EventTarget, type: K, handler: (event: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions) {
        target.addEventListener(type, handler as EventListener, options);

        cleanups.push(function () {
            target.removeEventListener(type, handler as EventListener, options); // detach the exact listener that was registered
        });
    }

    function registerAllEventListeners() {

        // Pointer drag — grab on the handle, then track globally via pointer capture
        registerEventListener(handleElement, "pointerdown", function (event) {
            handlePointerDown(event);
        });

        registerEventListener(handleElement, "pointermove", function (event) {
            handlePointerMove(event);
        });

        registerEventListener(handleElement, "pointerup", function (event) {
            handlePointerUp(event);
        });

        registerEventListener(handleElement, "pointercancel", function (event) {
            handlePointerUp(event);
        });

        // Hover cursor — clear the resize cursor when the pointer leaves the element
        registerEventListener(handleElement, "pointerleave", function () {
            if (destroyed) return;

            if (resizable && hoverSide !== null) {
                hoverSide = null;
                if (!resizing) notify();
            }
        });
    }

    // endregion

    // region ===== Error Handling =====================================================================================
    const reportError = createErrorReporter(onError);

    // endregion

    // region ===== State ==============================================================================================
    const notifier = createNotifier(getState);
    const subscriptions = new WeakMap<(state: DraggableState) => void, (state: DraggableState) => void>();
    const notify = notifier.notify;

    // Subscribe to drag changes. The listener gets state on every change (not immediately — read getState() for the first paint). Returns an unsubscribe function.
    function subscribe(listener: (state: DraggableState) => void): () => void {
        if (typeof listener !== "function") {
            throw new TypeError("createNotifier: 'listener' must be a function.");
        }
        if (destroyed) return function unsubscribe() {};

        let wrapped = subscriptions.get(listener);
        if (!wrapped) {
            wrapped = function (state) {
                listener({...state});
            };
            subscriptions.set(listener, wrapped);
        }

        // Stable wrappers preserve duplicate subscriptions while isolating each consumer's snapshot.
        return notifier.subscribe(wrapped);
    }

    function getState(): DraggableState {
        return {
            x: roundTo(x, 2),
            y: roundTo(y, 2),
            dragging: dragging,
            axis: axis,
            disabled: isDisabled,
            canDrag: !isDisabled,
            boundsMode: typeof bounds === "string" ? bounds : "custom",
            resizable: resizable,
            resizing: resizing,
            resizeSide: resizeSide,
            width: roundTo(width, 2),
            height: roundTo(height, 2),
            canResize: resizable && !isDisabled,
            cursor: resizing ? resizeCursor(resizeSide!) : hoverSide ? resizeCursor(hoverSide) : "",
            transform: getTransform()
        };
    }

    // endregion

    // region ===== Drag State =========================================================================================
    let x = 0; // horizontal offset from the element's natural layout position, in px
    let y = 0; // vertical offset
    let dragging = false; // true once a press has moved past the threshold
    let isDisabled = disabled; // mutable copy, so dragging can be switched off/on at runtime

    function getTransform() {
        return "translate(" + roundTo(x, 2) + "px, " + roundTo(y, 2) + "px)";
    }

    function getBoundsRect() {
        if (bounds === "none") return null;

        if (bounds === "viewport") {
            return {
                top: 0,
                left: 0,
                right: defaultView.innerWidth,
                bottom: defaultView.innerHeight
            };
        }

        if (bounds === "parent") return element.parentElement ? element.parentElement.getBoundingClientRect() : null;

        if ("getBoundingClientRect" in bounds && typeof bounds.getBoundingClientRect === "function") return bounds.getBoundingClientRect();

        return bounds as Pick<DOMRect, "left" | "right" | "top" | "bottom">; // an explicit {top, left, right, bottom} rect
    }

    // The element's layout box (where it sits with NO offset) — its current on-screen box minus the current offset.
    function getLayoutRect() {
        const rect = element.getBoundingClientRect();

        return {
            left: rect.left - x,
            top: rect.top - y,
            right: rect.right - x,
            bottom: rect.bottom - y
        };
    }

    // Keep the element inside its bounds: given a layout box, cap the offset so no edge crosses the container.
    function clampOffset(nextX: number, nextY: number, layoutRect: Pick<DOMRect, "left" | "right" | "top" | "bottom">) {
        const boundsRect = getBoundsRect();
        if (!boundsRect) return {x: nextX, y: nextY};

        const minX = boundsRect.left - layoutRect.left;
        const maxX = boundsRect.right - layoutRect.right;
        const minY = boundsRect.top - layoutRect.top;
        const maxY = boundsRect.bottom - layoutRect.bottom;

        return {
            x: minX <= maxX ? clamp(nextX, minX, maxX) : minX,
            y: minY <= maxY ? clamp(nextY, minY, maxY) : minY
        };
    }

    // endregion

    // region ===== Gesture Core =======================================================================================
    let activePointerId: number | null = null; // the pointer currently driving a drag; others are ignored
    let pressed = false; // pointer is down on the handle, but maybe not yet past the threshold
    let startClientX = 0; // pointer position where the press began
    let startClientY = 0;
    let originX = 0; // the x/y offset at the moment of the press; deltas add to this
    let originY = 0;
    let grabLayout: {left: number; top: number; right: number; bottom: number;} | null = null; // the element's layout box captured at grab, so clamping stays stable mid-drag

    function handlePointerDown(event: {clientX: number; clientY: number; pointerId: number;}) {
        if (destroyed || isDisabled) return;
        if (activePointerId !== null) return; // a gesture is already in progress

        // Near an edge and resizable? Start a resize. Otherwise, a drag.
        if (resizable) {
            const side = detectResizeSide(element.getBoundingClientRect(), event.clientX, event.clientY, resizeEdgeSize, resizeHandles);
            if (side) {
                if (!width || !height) captureSize();

                resizing = true;
                resizeSide = side;
                activePointerId = event.pointerId;
                resizeStartClientX = event.clientX;
                resizeStartClientY = event.clientY;
                startWidth = width;
                startHeight = height;
                resizeStartX = x;
                resizeStartY = y;
                resizeLayout = getLayoutRect();
                handleElement.setPointerCapture(event.pointerId);
                notify();
                return;
            }
        }

        pressed = true;
        activePointerId = event.pointerId;
        startClientX = event.clientX;
        startClientY = event.clientY;
        originX = x;
        originY = y;
        grabLayout = getLayoutRect();
        handleElement.setPointerCapture(event.pointerId); // keep receiving moves even off the element
    }

    function handlePointerMove(event: PointerEvent) {
        if (destroyed || isDisabled) return;

        // No active gesture: keep the resize cursor in sync while hovering (resizable only)
        if (activePointerId === null) {
            if (resizable) updateHoverCursor(event);
            return;
        }

        if (event.pointerId !== activePointerId) return;

        if (resizing) {
            handleResizeMove(event);
            return;
        }

        const deltaX = axis === "y" ? 0 : event.clientX - startClientX;
        const deltaY = axis === "x" ? 0 : event.clientY - startClientY;

        // Below the threshold it's still a click, not a drag
        if (!dragging && Math.hypot(deltaX, deltaY) < threshold) return;

        const clamped = clampOffset(originX + deltaX, originY + deltaY, grabLayout!);
        const changed = !dragging || roundTo(x, 2) !== roundTo(clamped.x, 2) || roundTo(y, 2) !== roundTo(clamped.y, 2);

        dragging = true;
        x = clamped.x;
        y = clamped.y;

        if (changed) notify();
    }

    function handlePointerUp(event: {pointerId: number;}) {
        if (destroyed || event.pointerId !== activePointerId) return;

        if (handleElement.hasPointerCapture(event.pointerId)) {
            handleElement.releasePointerCapture(event.pointerId);
        }

        pressed = false;
        activePointerId = null;
        grabLayout = null;

        if (resizing) {
            resizing = false;
            resizeSide = null;
            resizeLayout = null;
            notify();
            return;
        }

        if (dragging) {
            dragging = false;
            notify(); // emit the settled, not-dragging state
        }
    }

    function cancelGesture() {
        if (activePointerId !== null && handleElement.hasPointerCapture(activePointerId)) {
            handleElement.releasePointerCapture(activePointerId);
        }

        pressed = false;
        dragging = false;
        resizing = false;
        resizeSide = null;
        hoverSide = null;
        resizeLayout = null;
        grabLayout = null;
        activePointerId = null;
    }

    // endregion

    // region ===== Move Controls ======================================================================================
    function setPosition(nextX: number, nextY: number): void {
        if (destroyed) return;

        if (typeof nextX !== "number" || !Number.isFinite(nextX) || typeof nextY !== "number" || !Number.isFinite(nextY)) {
            throw new TypeError("setPosition: 'x' and 'y' must both be finite numbers.");
        }

        const clamped = clampOffset(axis === "y" ? x : nextX, axis === "x" ? y : nextY, getLayoutRect());
        const changed = roundTo(x, 2) !== roundTo(clamped.x, 2) || roundTo(y, 2) !== roundTo(clamped.y, 2);

        x = clamped.x;
        y = clamped.y;

        if (changed) notify();
    }

    function reset(): void {
        if (destroyed) return;

        setPosition(0, 0);
    }

    function setDisabled(value: boolean): void {
        if (destroyed) return;

        if (typeof value !== "boolean") {
            throw new TypeError("setDisabled: the value must be a boolean.");
        }

        const changed = isDisabled !== value || (value && (dragging || resizing || hoverSide !== null));
        isDisabled = value;

        if (isDisabled) {
            cancelGesture();
        }

        if (changed) notify();
    }

    // endregion

    // region ===== Resize Controls ====================================================================================
    let width = 0; // the element's current width in px — managed only when resizable
    let height = 0; // current height
    let resizing = false; // true while a resize gesture is in progress
    let resizeSide: DraggableResizeSide | null = null; // the edge driving the resize ("se", "n", ...), or null
    let hoverSide: string | null = null; // the edge the idle pointer is over, for cursor feedback
    let resizeLayout: ReturnType<typeof getLayoutRect> | null = null; // layout box captured at resize start
    let resizeStartClientX = 0;
    let resizeStartClientY = 0;
    let startWidth = 0;
    let startHeight = 0;
    let resizeStartX = 0;
    let resizeStartY = 0;

    function captureSize() {
        const rect = element.getBoundingClientRect();

        width = rect.width;
        height = rect.height;
    }

    function updateHoverCursor(event: PointerEvent) {
        const side = detectResizeSide(element.getBoundingClientRect(), event.clientX, event.clientY, resizeEdgeSize, resizeHandles);

        if (side !== hoverSide) {
            const changed = resizeCursor(side || "") !== resizeCursor(hoverSide || "");
            hoverSide = side;
            if (changed) notify();
        }
    }

    function handleResizeMove(event: {clientX: number; clientY: number;}) {
        const deltaX = event.clientX - resizeStartClientX;
        const deltaY = event.clientY - resizeStartClientY;
        const movesEast = resizeSide!.includes("e");
        const movesWest = resizeSide!.includes("w");
        const movesSouth = resizeSide!.includes("s");
        const movesNorth = resizeSide!.includes("n");
        const resizedDimensions = applyAspectAndClamp(startWidth + (movesEast ? deltaX : movesWest ? -deltaX : 0), startHeight + (movesSouth ? deltaY : movesNorth ? -deltaY : 0));
        const nextX = movesWest ? resizeStartX + (startWidth - resizedDimensions.width) : resizeStartX;
        const nextY = movesNorth ? resizeStartY + (startHeight - resizedDimensions.height) : resizeStartY;
        const clamped = clampResizeToBounds(resizedDimensions.width, resizedDimensions.height, nextX, nextY);
        const changed = roundTo(width, 2) !== roundTo(clamped.width, 2) || roundTo(height, 2) !== roundTo(clamped.height, 2)
            || roundTo(x, 2) !== roundTo(clamped.x, 2) || roundTo(y, 2) !== roundTo(clamped.y, 2);

        width = clamped.width;
        height = clamped.height;
        x = clamped.x;
        y = clamped.y;

        if (changed) notify();
    }

    function applyAspectAndClamp(nextWidth: number, nextHeight: number) {
        if (aspectRatio !== null) {
            const ratio = aspectRatio === "auto" ? startWidth / startHeight : aspectRatio;

            if (resizeSide === "n" || resizeSide === "s") {
                nextHeight = clamp(nextHeight, Math.max(minHeight, minWidth / ratio), Math.min(maxHeight, maxWidth / ratio));
                nextWidth = nextHeight * ratio;
            } else {
                nextWidth = clamp(nextWidth, Math.max(minWidth, minHeight * ratio), Math.min(maxWidth, maxHeight * ratio));
                nextHeight = nextWidth / ratio;
            }

            return {width: nextWidth, height: nextHeight};
        }

        return {
            width: clamp(nextWidth, minWidth, maxWidth),
            height: clamp(nextHeight, minHeight, maxHeight)
        };
    }

    function clampResizeToBounds(nextWidth: number, nextHeight: number, nextX: number, nextY: number) {
        const boundsRect = getBoundsRect();

        if (!boundsRect || !resizeLayout) {
            return {width: nextWidth, height: nextHeight, x: nextX, y: nextY};
        }

        const minX = boundsRect.left - resizeLayout.left;
        const maxRight = boundsRect.right - resizeLayout.left;
        const minY = boundsRect.top - resizeLayout.top;
        const maxBottom = boundsRect.bottom - resizeLayout.top;
        const clampedX = clamp(nextX, minX, maxRight - minWidth);
        const clampedY = clamp(nextY, minY, maxBottom - minHeight);
        const movesWest = resizeSide!.includes("w");
        const movesNorth = resizeSide!.includes("n");
        const fixedRight = Math.min(maxRight, resizeStartX + startWidth);
        const fixedBottom = Math.min(maxBottom, resizeStartY + startHeight);
        const availableWidth = movesWest ? fixedRight - minX : maxRight - clampedX;
        const availableHeight = movesNorth ? fixedBottom - minY : maxBottom - clampedY;
        let clampedWidth = clamp(nextWidth, minWidth, availableWidth);
        let clampedHeight = clamp(nextHeight, minHeight, availableHeight);

        // Bounds may limit either dimension; keep a feasible locked ratio after that limit.
        if (aspectRatio !== null) {
            const ratio = aspectRatio === "auto" ? startWidth / startHeight : aspectRatio;
            const ratioWidth = Math.min(clampedWidth, clampedHeight * ratio);
            const ratioHeight = ratioWidth / ratio;

            if (ratioWidth >= minWidth && ratioHeight >= minHeight) {
                clampedWidth = ratioWidth;
                clampedHeight = ratioHeight;
            }
        }

        // Derive moving origins from the final size so west/north keep their opposite edges fixed.
        return {
            width: clampedWidth,
            height: clampedHeight,
            x: movesWest ? clamp(fixedRight - clampedWidth, minX, maxRight - minWidth) : clampedX,
            y: movesNorth ? clamp(fixedBottom - clampedHeight, minY, maxBottom - minHeight) : clampedY
        };
    }

    function setSize(nextWidth: number, nextHeight: number): void {
        if (destroyed || !resizable) return;

        if (typeof nextWidth !== "number" || !Number.isFinite(nextWidth) || typeof nextHeight !== "number" || !Number.isFinite(nextHeight)) {
            throw new TypeError("setSize: 'width' and 'height' must both be finite numbers.");
        }

        const clampedWidth = clamp(nextWidth, minWidth, maxWidth);
        const clampedHeight = clamp(nextHeight, minHeight, maxHeight);
        const changed = roundTo(width, 2) !== roundTo(clampedWidth, 2) || roundTo(height, 2) !== roundTo(clampedHeight, 2);

        width = clampedWidth;
        height = clampedHeight;

        if (changed) notify();
    }

    // endregion

    // region ===== Tear Down ==========================================================================================
    function destroy(): void {
        if (destroyed) return;

        destroyed = true; // make future work and future destroy calls harmless
        cancelGesture();

        cleanups.forEach(function (cleanup) {
            cleanup();
        });

        cleanups.length = 0; // release references to the cleanup functions and their event targets

        notifier.destroy();
    }

    // endregion

    init();

    return {
        getState,
        subscribe,
        setPosition,
        reset,
        setDisabled,
        setSize,
        destroy
    };
}
