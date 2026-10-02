import {callConsumer, createErrorReporter} from 'strata-packages/ui-interactions/internal/core';

export interface DroppablePoint {
    x: number
    y: number
}

export interface DroppableState<TPayload = unknown, TTarget = unknown> {
    dragging: boolean
    payload: TPayload | null
    point: DroppablePoint | null
    origin: DroppablePoint | null
    activeTarget: TTarget | null
    canDropHere: boolean
}

export interface DroppableError {
    id: string
    message: string
    metadata: unknown
}

export interface DroppableConfig<TPayload = unknown, TTarget = unknown> {
    onChange?: (state: DroppableState<TPayload, TTarget>) => void
    onError?: (error: DroppableError) => void
    onDrop?: (payload: TPayload, target: TTarget) => void
    container: HTMLElement
    getPayload?: (event: PointerEvent) => TPayload | null | undefined
    canDrop?: (payload: TPayload, target: TTarget) => boolean
    dragThreshold?: number
}

export interface DroppableEngine<TPayload = unknown, TTarget = unknown> {
    getState(): DroppableState<TPayload, TTarget>
    subscribe(listener: (state: DroppableState<TPayload, TTarget>) => void): () => void
    registerTarget(element: HTMLElement, data: TTarget): () => void
    destroy(): void
}

export function createDroppable<TPayload = unknown, TTarget = unknown>(config: DroppableConfig<TPayload, TTarget>): DroppableEngine<TPayload, TTarget> {
    if (!config || typeof config !== "object") {
        throw new TypeError("createDroppable: 'config' must be an options object.");
    }

    // region ===== Config =============================================================================================
    const {
        onChange, onError, onDrop,
        container,
        getPayload = function () {return null;},
        canDrop = function () {return true;},
        dragThreshold = 4
    } = config;

    validateConfig();

    function validateConfig() {

        // On Change
        if (onChange !== undefined && typeof onChange !== "function") {
            throw new TypeError("createDroppable: the 'onChange' option must be a function when provided.");
        }

        // On Error
        if (onError !== undefined && typeof onError !== "function") {
            throw new TypeError("createDroppable: the 'onError' option must be a function when provided.");
        }

        // On Drop
        if (onDrop !== undefined && typeof onDrop !== "function") {
            throw new TypeError("createDroppable: the 'onDrop' option must be a function when provided.");
        }

        // Container — the element we listen on for the drag gesture (shared with the grid/selection)
        if (!container || typeof container.getBoundingClientRect !== "function" || !("ownerDocument" in container)) {
            throw new TypeError("createDroppable: the 'container' option must be a DOM element.");
        }

        // Get Payload — resolves a pointerdown into the thing being dragged (or null to ignore it)
        if (typeof getPayload !== "function") {
            throw new TypeError("createDroppable: the 'getPayload' option must be a function.");
        }

        // Can Drop — validates a payload against a zone's data
        if (typeof canDrop !== "function") {
            throw new TypeError("createDroppable: the 'canDrop' option must be a function.");
        }

        // Drag Threshold — pixels of movement before a press becomes a drag
        if (typeof dragThreshold !== "number" || !Number.isFinite(dragThreshold) || dragThreshold < 0) {
            throw new TypeError("createDroppable: the 'dragThreshold' option must be a non-negative number.");
        }
    }

    // endregion

    // region ===== Init ===============================================================================================
    let destroyed = false; // late pointer events must not still fire callbacks after teardown

    function init() {

        // Wire up subscribers and listeners first, so nothing that follows goes unheard
        if (onChange) subscribe(onChange);

        registerAllEventListeners();

        // Emit the initial (idle) state so the consumer can render from the first frame
        notify();
    }

    // endregion

    // region ===== Event Listeners ====================================================================================
    const listeners = new Set<(state: DroppableState<TPayload, TTarget>) => void>(); // change subscribers — each gets the full state on every change
    const cleanups: (() => void)[] = []; // teardown functions, collected so everything can be undone at once

    function registerEventListener<K extends keyof HTMLElementEventMap>(target: EventTarget, type: K, handler: (event: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions) {
        target.addEventListener(type, handler as EventListener, options);

        cleanups.push(function () {
            target.removeEventListener(type, handler as EventListener, options); // detach the exact listener that was registered
        });
    }

    function registerAllEventListeners() {

        // Capture-phase pointerdown so we still hear cell presses that stopPropagation to suppress the marquee.
        registerEventListener(container, "pointerdown", handlePointerDown, {capture: true});

        registerEventListener(container, "pointermove", handlePointerMove);
        registerEventListener(container, "pointerup", handlePointerUp);
        registerEventListener(container, "pointercancel", handlePointerCancel);
    }

    // endregion

    // region ===== Error Handling =====================================================================================
    const reportError = createErrorReporter(onError);

    // endregion

    // region ===== State ==============================================================================================
    let dragging = false; // true once a press has moved past the threshold
    let payload: TPayload | null = null; // the opaque thing being dragged (from getPayload), or null
    let point: DroppablePoint | null = null; // {x, y} current pointer in client coords, for the ghost
    let origin: {x: number; y: number} | null = null; // {x, y} where the drag started, in client coords
    let activeTarget: TTarget | null = null; // the zone data currently under the pointer, or null
    let canDropHere = false; // whether activeTarget accepts the payload (the canDrop result)
    let lastStateSignature = ""; // last emitted state fingerprint, used to avoid duplicate echoes

    // Subscribe to changes. The listener gets state on every change (not immediately — read getState() for the first paint). Returns an unsubscribe function.
    function subscribe(listener: (state: DroppableState<TPayload, TTarget>) => void): () => void {
        if (destroyed) return function unsubscribe() {};

        listeners.add(listener);

        return function unsubscribe() {
            listeners.delete(listener);
        };
    }

    // Emit the current state to every subscriber, deduped against the last snapshot so no-op changes cost nothing.
    function notify() {
        if (destroyed) return;
        const state = getState();
        const stateSignature = JSON.stringify(state);
        if (stateSignature === lastStateSignature) return;

        lastStateSignature = stateSignature;

        for (const listener of listeners) {
            callConsumer(listener, state);
        }
    }

    function getState(): DroppableState<TPayload, TTarget> {
        return {
            dragging: dragging,
            payload: payload,
            point: point,
            origin: origin,
            activeTarget: activeTarget,
            canDropHere: canDropHere
        };
    }

    // endregion

    // region ===== Targets ============================================================================================
    const targets = new Map<HTMLElement, TTarget>(); // registered drop zones, element → opaque data

    // Register a drop zone. Returns an unregister function (like subscribe). The data rides in getState() + onDrop.
    function registerTarget(element: HTMLElement, data: TTarget): () => void {
        if (destroyed) return function unregister() {};
        if (!element || typeof element.getBoundingClientRect !== "function") {
            throw new TypeError("registerTarget: 'element' must be a DOM element.");
        }

        targets.set(element, data);

        return function unregister() {
            targets.delete(element);
        };
    }

    // endregion

    // region ===== Hit-Testing ========================================================================================
    // The drop zone under a point — the smallest-area match, so nested zones resolve to the innermost. Null if none.
    function findTargetAtPoint(clientX: number, clientY: number) {
        let bestEntry = null;
        let bestArea = Infinity;
        for (const [element, data] of targets) {
            const rect = element.getBoundingClientRect();
            const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
            if (!inside) continue;

            const area = rect.width * rect.height;
            if (area < bestArea) {
                bestArea = area;
                bestEntry = {element: element, data: data};
            }
        }

        return bestEntry;
    }

    // endregion

    // region ===== Drag Gesture =======================================================================================
    let activePointerId: number | null = null; // the pointer we're tracking through the gesture
    let pressStartX = 0; // where the press began (client coords), for the threshold check
    let pressStartY = 0;
    let pressPayload: (TPayload & {}) | null = null; // payload resolved at pointerdown, held until the drag actually starts
    let pressed = false; // armed by a payload-bearing pointerdown, but not yet past the threshold

    // A payload-bearing press arms the gesture; empty space returns null so selection's marquee can handle it instead.
    function handlePointerDown(event: PointerEvent) {
        if (destroyed || pressed || dragging) return;

        const resolved = getPayload(event);
        if (resolved === null || resolved === undefined) return;

        pressed = true;
        activePointerId = event.pointerId;
        pressStartX = event.clientX;
        pressStartY = event.clientY;
        pressPayload = resolved;
    }

    function handlePointerMove(event: PointerEvent) {
        if (destroyed || event.pointerId !== activePointerId) return;

        // Below the threshold it's still just a press — leave a plain click alone.
        if (!dragging) {
            const movedX = event.clientX - pressStartX;
            const movedY = event.clientY - pressStartY;
            if (movedX * movedX + movedY * movedY < dragThreshold * dragThreshold) return;

            startDrag();
        }

        point = {x: event.clientX, y: event.clientY};

        // Recompute the zone under the pointer and whether it accepts the payload.
        const entry = findTargetAtPoint(event.clientX, event.clientY);
        activeTarget = entry ? entry.data : null;
        canDropHere = entry !== null && Boolean(canDrop(payload!, entry.data));

        notify();
    }

    function handlePointerUp(event: PointerEvent) {
        if (destroyed || event.pointerId !== activePointerId) return;

        const droppedPayload = payload;
        const droppedTarget = activeTarget;
        const accepted = dragging && droppedTarget !== null && canDropHere;

        resetDrag();
        notify();

        // Fire the action callback in isolation, after state has already settled back to idle.
        if (accepted && onDrop) {
            callConsumer(function () {onDrop(droppedPayload!, droppedTarget!);}, undefined);
        }
    }

    function handlePointerCancel(event: PointerEvent) {
        if (destroyed || event.pointerId !== activePointerId) return;

        resetDrag();
        notify();
    }

    // Cross the threshold: promote the press into a live drag and capture the pointer so moves keep coming.
    function startDrag() {
        pressed = false;
        dragging = true;
        payload = pressPayload;
        origin = {x: pressStartX, y: pressStartY};

        if (container.setPointerCapture) container.setPointerCapture(activePointerId!);
    }

    // Release the pointer and wipe every drag field back to idle.
    function resetDrag() {
        if (activePointerId !== null && container.hasPointerCapture && container.hasPointerCapture(activePointerId)) {
            container.releasePointerCapture(activePointerId);
        }

        pressed = false;
        dragging = false;
        payload = null;
        point = null;
        origin = null;
        activeTarget = null;
        canDropHere = false;
        pressPayload = null;
        activePointerId = null;
        pressStartX = 0;
        pressStartY = 0;
    }

    // endregion

    // region ===== Tear Down ==========================================================================================
    function destroy(): void {
        if (destroyed) return;

        destroyed = true; // make future work and future destroy calls harmless

        cleanups.forEach(function (cleanup) {
            cleanup();
        });

        cleanups.length = 0; // release references to the cleanup functions and their event targets
        listeners.clear();
    }

    // endregion

    init();

    return {
        getState,
        subscribe,
        registerTarget,
        destroy
    };
}
