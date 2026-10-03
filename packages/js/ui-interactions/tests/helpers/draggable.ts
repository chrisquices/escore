import {createDraggable} from 'strata-packages/ui-interactions/draggable';

function createEventTarget(ownerDocument, getBoundingClientRect) {
    const handlers = new Map();
    const captures = new Set();
    const registrations = [];
    const removals = [];
    const captureCalls = [];
    const releaseCalls = [];
    return {
        ownerDocument,
        getBoundingClientRect,
        handlers, captures, registrations, removals, captureCalls, releaseCalls,
        addEventListener(type, handler, options) {
            registrations.push({type, handler, options});
            handlers.set(type, handler);
        },
        removeEventListener(type, handler, options) {
            removals.push({type, handler, options});
            if (handlers.get(type) === handler) handlers.delete(type);
        },
        setPointerCapture(id) { captureCalls.push(id); captures.add(id); },
        hasPointerCapture: id => captures.has(id),
        releasePointerCapture(id) { releaseCalls.push(id); captures.delete(id); },
        handlePointer(type, x = 70, y = 70, pointerId = 1) {
            const event = {type, clientX: x, clientY: y, pointerId};
            handlers.get(type)?.(event);
            return event;
        },
    };
}

export function createHost(options = {}) {
    const layout = {left: 20, top: 30, width: 100, height: 80, ...options};
    const applied = {x: 0, y: 0, width: layout.width, height: layout.height};
    const viewport = {innerWidth: 320, innerHeight: 240};
    const ownerDocument = {defaultView: viewport};
    const parentRect = {left: 0, top: 0, right: 300, bottom: 220};
    const parent = {getBoundingClientRect: () => ({...parentRect, width: parentRect.right - parentRect.left, height: parentRect.bottom - parentRect.top})};
    const selectors = new Map();
    const queries = [];
    const element = createEventTarget(ownerDocument, function () {
        const left = layout.left + applied.x;
        const top = layout.top + applied.y;
        return {left, top, right: left + applied.width, bottom: top + applied.height, width: applied.width, height: applied.height};
    });
    const handle = createEventTarget(ownerDocument, element.getBoundingClientRect);
    element.parentElement = parent;
    element.querySelector = selector => { queries.push(selector); return selectors.get(selector) || null; };
    selectors.set('.handle', handle);

    // Like a rendering consumer, apply every observable translation and managed size to the box.
    function applyState(state) {
        applied.x = state.x;
        applied.y = state.y;
        if (state.resizable) {
            applied.width = state.width;
            applied.height = state.height;
        }
    }

    return {element, handle, layout, applied, parent, parentRect, viewport, ownerDocument, selectors, queries, applyState};
}

export function createFixture(t, options = {}, host = createHost()) {
    const events = [];
    const {onChange, ...config} = options;
    const engine = createDraggable(host.element, {
        ...config,
        onChange(state) {
            host.applyState(state);
            events.push(state);
            onChange?.(state);
        },
    });
    t.after(() => engine.destroy());
    const target = typeof config.handle === 'string' ? host.selectors.get(config.handle) || host.element : config.handle || host.element;
    return {...host, engine, events, target, handlePointer: target.handlePointer};
}

export const resizePoints = {
    nw: [20, 30], n: [70, 30], ne: [120, 30], e: [120, 70],
    se: [120, 110], s: [70, 110], sw: [20, 110], w: [20, 70],
};

export function geometry(engine) {
    const {x, y, width, height} = engine.getState();
    return {x, y, width, height};
}
