

// core.ts
// Shared primitives every engine (video, dropzone, …) is built on. No shared module-level mutable
// state lives here — factories may keep per-instance state in their own closures.

// Invoke a consumer-supplied callback in isolation: one that throws can't abort an in-progress
// update or starve the other subscribers. The error surfaces to the console rather than vanishing.
export function callConsumer<T>(callback: (argument: T) => unknown, argument: T) {
    try {
        callback(argument);
    } catch (error) {
        console.error("A consumer callback threw —", error);
    }
}

// Per-instance state delivery, immediate or coalesced into one animation frame. Callers signal changes.
export function createNotifier<T, F>(getState: () => T, config: {requestFrame?: (callback: () => void) => F, cancelFrame?: (frame: F) => void} = {}) {
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

    const listeners = new Set<(state: T) => unknown>();

    let destroyed = false;
    let revision = 0;
    let emittedRevision = -1;
    let frame: F | null = null;

    function subscribe(listener: (state: T) => unknown) {
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
export function createErrorReporter<TMetadata = unknown>(onError: ((error: {id: string, message: string, metadata: TMetadata | null}) => void) | null | undefined) {
    return function reportError(id: string, text: string, metadata: TMetadata | null = null) {
        if (onError) {
            callConsumer(onError, {id: id, message: text, metadata: metadata});
        }
    };
}
