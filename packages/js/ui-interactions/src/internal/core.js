// core.js
// Shared primitives every engine (video, dropzone, …) is built on. No shared module-level mutable
// state lives here — factories may keep per-instance state in their own closures.

// Invoke a consumer-supplied callback in isolation: one that throws can't abort an in-progress
// update or starve the other subscribers. The error surfaces to the console rather than vanishing.
/**
 * @template T
 * @param {(argument: T) => unknown} callback
 * @param {T} argument
 */
export function callConsumer(callback, argument) {
    try {
        callback(argument);
    } catch (error) {
        console.error("A consumer callback threw —", error);
    }
}

// Per-instance state delivery, immediate or coalesced into one animation frame. Callers signal changes.
/**
 * @template T, F
 * @param {() => T} getState
 * @param {{ requestFrame?: (callback: () => void) => F, cancelFrame?: (frame: F) => void }} [config={}]
 */
export function createNotifier(getState, config = {}) {
    if (typeof getState !== "function") {
        throw new TypeError("createNotifier: 'getState' must be a function.");
    }

    if (!config || typeof config !== "object") {
        throw new TypeError("createNotifier: 'config' must be an options object.");
    }

    const {requestFrame, cancelFrame} = config;

    if (requestFrame !== undefined && typeof requestFrame !== "function") {
        throw new TypeError("createNotifier: the 'requestFrame' option must be a function when provided.");
    }

    if (cancelFrame !== undefined && typeof cancelFrame !== "function") {
        throw new TypeError("createNotifier: the 'cancelFrame' option must be a function when provided.");
    }

    const listeners = new Set();

    let destroyed = false;
    let revision = 0;
    let emittedRevision = -1;
    /** @type {F | null} */
    let frame = null;

    /**
     * @param {(state: T) => unknown} listener
     */
    function subscribe(listener) {
        if (typeof listener !== "function") {
            throw new TypeError("createNotifier: 'listener' must be a function.");
        }

        if (destroyed) return function unsubscribe() {};

        listeners.add(listener);

        return function unsubscribe() {
            listeners.delete(listener);
        };
    }

    function notify() {
        if (destroyed) return;

        revision++;

        if (frame !== null && cancelFrame) {
            cancelFrame(frame);
            frame = null;
        }

        flush();
    }

    function notifyFrame() {
        if (destroyed) return;

        revision++;

        if (frame !== null) return;

        if (!requestFrame) {
            flush();
            return;
        }

        frame = requestFrame(function () {
            frame = null;
            flush();
        });
    }

    function flush() {
        if (destroyed || revision === emittedRevision) return;

        const currentRevision = revision;
        const state = getState();
        emittedRevision = currentRevision;

        for (const listener of listeners) {
            if (destroyed || revision !== currentRevision) return;

            callConsumer(listener, state);
        }
    }

    function destroy() {
        if (destroyed) return;

        destroyed = true;

        if (frame !== null && cancelFrame) {
            cancelFrame(frame);
        }

        frame = null;
        listeners.clear();
    }

    return {
        subscribe,
        notify,
        notifyFrame,
        destroy
    };
}

// Per-instance fire-and-forget error reporter, shared by every engine: fires {id, message, metadata} at the consumer's onError.
// The engine stores nothing — keeping, toasting, or ignoring an error is entirely the consumer's job.
/**
 * @param {((error: { id: string, message: string, metadata: unknown }) => void) | null | undefined} onError
 */
export function createErrorReporter(onError) {
    /**
     * @param {string} id
     * @param {string} text
     * @param {unknown} [metadata=null]
     */
    return function reportError(id, text, metadata = null) {
        if (onError) {
            callConsumer(onError, {id: id, message: text, metadata: metadata});
        }
    };
}
