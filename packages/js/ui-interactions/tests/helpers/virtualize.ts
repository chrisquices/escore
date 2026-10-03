import {createVirtualizer} from 'strata-packages/ui-interactions/virtualize';

function createElement(ownerDocument, rect, options = {}) {
    const handlers = new Map();
    const registrations = [];
    const removals = [];
    const scrollWrites = [];
    let scrollTop = options.scrollTop ?? 0;
    return {
        ownerDocument, handlers, registrations, removals, scrollWrites,
        clientHeight: options.clientHeight ?? 200,
        scrollLimit: options.scrollLimit ?? Infinity,
        firstElementChild: null,
        getBoundingClientRect: () => ({...rect, right: rect.left + rect.width, bottom: rect.top + rect.height}),
        get scrollTop() { return scrollTop; },
        set scrollTop(value) {
            scrollWrites.push(value);
            scrollTop = Math.max(0, Math.min(this.scrollLimit, value));
        },
        addEventListener(type, handler, options) {
            registrations.push({type, handler, options});
            if (!handlers.has(type)) handlers.set(type, new Set());
            handlers.get(type).add(handler);
        },
        removeEventListener(type, handler, options) {
            removals.push({type, handler, options});
            handlers.get(type)?.delete(handler);
        },
        dispatch(type) {
            for (const handler of handlers.get(type) || []) handler({type});
        },
    };
}

export function createHost(options = {}) {
    const style = {gridTemplateColumns: '100px 100px', rowGap: '10px', columnGap: '20px', ...options.style};
    const cellRect = {left: 0, top: 0, width: 100, height: 100, ...options.cellRect};
    const gridRect = {left: 20, top: 30, width: 220, height: 200, ...options.gridRect};
    const scrollRect = {left: 20, top: 30, width: 220, height: 200, ...options.scrollRect};
    const frames = new Map();
    const requestedFrames = [];
    const cancelledFrames = [];
    const observers = [];
    const styleReads = [];
    let nextFrame = 0;
    const defaultView = {
        getComputedStyle(element) { styleReads.push(element); return style; },
        requestAnimationFrame(callback) {
            const id = nextFrame++;
            frames.set(id, callback);
            requestedFrames.push({id, callback});
            return id;
        },
        cancelAnimationFrame(id) { cancelledFrames.push(id); frames.delete(id); },
    };
    if (options.resizeObserver !== false) {
        defaultView.ResizeObserver = function (callback) {
            const observer = {
                callback, observed: [], disconnects: 0,
                observe(element) { observer.observed.push(element); },
                disconnect() { observer.disconnects++; },
            };
            observers.push(observer);
            return observer;
        };
    }
    const ownerDocument = {defaultView};
    const gridElement = createElement(ownerDocument, gridRect, options.separateScrollElement ? {} : options);
    const scrollElement = options.separateScrollElement ? createElement(ownerDocument, scrollRect, options) : gridElement;
    const firstCell = {getBoundingClientRect: () => ({...cellRect})};
    if (options.hasCell !== false) gridElement.firstElementChild = firstCell;

    function resize() {
        for (const observer of observers) {
            if (!observer.disconnects) observer.callback([]);
        }
    }

    function flushFrames() {
        // A frame requested by a callback belongs to the next flush.
        for (const [id, callback] of [...frames]) {
            if (!frames.delete(id)) continue;
            callback(0);
        }
    }

    function scrollTo(offset) {
        scrollElement.scrollTop = offset;
        scrollElement.dispatch('scroll');
    }

    return {
        gridElement, scrollElement, style, cellRect, firstCell, gridRect, scrollRect, ownerDocument, defaultView,
        frames, requestedFrames, cancelledFrames, observers, styleReads, resize, flushFrames, scrollTo,
    };
}

export function createFixture(t, options = {}, host = createHost()) {
    const events = [];
    const {onChange, ...config} = options;
    const engine = createVirtualizer({
        gridElement: host.gridElement,
        scrollElement: host.scrollElement,
        ...config,
        onChange(state) { events.push(state); onChange?.(state); },
    });
    t.after(() => engine.destroy());
    return {...host, engine, events};
}

export function getIndices(state) {
    return state.items.map(item => item.index);
}
