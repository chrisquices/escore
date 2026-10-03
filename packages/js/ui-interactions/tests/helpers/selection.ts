import {createSelection} from 'strata-packages/ui-interactions/selection';

// Only the selectors used by the engine and these tests are modeled, not a CSS engine.
function matchesPart(element, selector) {
    if (selector === '.item') return element.item;
    if (selector === "[contenteditable]:not([contenteditable='false'])") {
        return 'contenteditable' in element.attributes && element.attributes.contenteditable !== 'false';
    }
    const attribute = selector.match(/^([a-z]+)?\[([a-z]+)(?:='([^']*)')?\]$/);
    if (attribute) {
        return (!attribute[1] || element.tag === attribute[1]) && attribute[2] in element.attributes &&
            (attribute[3] === undefined || element.attributes[attribute[2]] === attribute[3]);
    }
    return element.tag === selector;
}

export function createContainer(options = {}) {
    const {count = 6, columns = 3} = options;
    const rect = {left: 20, top: 30, width: 200, height: 160, ...options.rect};
    const handlers = new Map();
    const registrations = [];
    const removals = [];
    const captures = new Set();
    const captureCalls = [];
    const releaseCalls = [];
    const queries = [];
    const ownerDocument = {activeElement: null};

    function createElement(properties = {}, parent = null) {
        const element = {
            tag: 'div', attributes: {}, item: false, parentElement: parent, children: [], ownerDocument,
            ...properties,
            get isContentEditable() {
                if ('contenteditable' in this.attributes) return this.attributes.contenteditable !== 'false';
                return this.parentElement?.isContentEditable || false;
            },
            matches(selector) { return selector.split(',').some(part => matchesPart(this, part.trim())); },
            closest(selector) {
                for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node;
                return null;
            },
            contains(other) {
                for (let node = other; node; node = node.parentElement) if (node === this) return true;
                return false;
            },
        };
        if (parent) parent.children.push(element);
        return element;
    }

    const container = createElement({
        clientLeft: options.clientLeft ?? 0,
        clientTop: options.clientTop ?? 0,
        scrollLeft: options.scrollLeft ?? 0,
        scrollTop: options.scrollTop ?? 0,
        getBoundingClientRect() { return {...rect, right: rect.left + rect.width, bottom: rect.top + rect.height}; },
        querySelectorAll(selector) {
            queries.push(selector);
            const found = [];
            function visit(node) {
                for (const child of node.children) {
                    if (child.matches(selector)) found.push(child);
                    visit(child);
                }
            }
            visit(this);
            return found;
        },
        addEventListener(type, handler, options) {
            registrations.push({type, handler, options});
            handlers.set(type, handler);
        },
        removeEventListener(type, handler, options) {
            removals.push({type, handler, options});
            if (handlers.get(type) === handler) handlers.delete(type);
        },
        setPointerCapture(id) { captureCalls.push(id); captures.add(id); },
        hasPointerCapture(id) { return captures.has(id); },
        releasePointerCapture(id) { releaseCalls.push(id); captures.delete(id); },
    });

    const items = Array.from({length: count}, (_, index) => {
        const box = {x: index % columns * 25, y: Math.floor(index / columns) * 25, width: 20, height: 20};
        return createElement({
            item: true, box,
            getBoundingClientRect() {
                const left = rect.left + container.clientLeft - container.scrollLeft + box.x;
                const top = rect.top + container.clientTop - container.scrollTop + box.y;
                return {left, top, right: left + box.width, bottom: top + box.height, width: box.width, height: box.height};
            },
        }, container);
    });

    function dispatch(type, values = {}) {
        const event = {type, target: container, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...values};
        handlers.get(type)?.(event);
        return event;
    }

    function pointer(type, clientX = 100, clientY = 100, values = {}) {
        return dispatch(type, {clientX, clientY, pointerId: 1, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, ...values});
    }

    function key(key, values = {}) {
        return dispatch('keydown', {key, metaKey: false, ctrlKey: false, shiftKey: false, ...values});
    }

    return {container, items, rect, ownerDocument, createElement, handlers, registrations, removals, captures, captureCalls, releaseCalls, queries, dispatch, pointer, key};
}

export function createFixture(t, options = {}, host = createContainer()) {
    const events = [];
    const errors = [];
    const {onChange, onError, ...config} = options;
    const engine = createSelection({
        count: host.items.length,
        container: host.container,
        ...config,
        onChange(state) { events.push(state); onChange?.(state); },
        onError(error) { errors.push(error); onError?.(error); },
    });
    t.after(() => engine.destroy());
    return {...host, engine, events, errors};
}

export function selection(engine) {
    const {selected, anchor, focused} = engine.getState();
    return {selected, anchor, focused};
}
