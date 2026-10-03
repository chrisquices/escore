import {createDroppable} from 'strata-packages/ui-interactions/droppable';

export function createContainer() {
    const handlers = new Map();
    const captures = new Set();
    const registrations = [];
    const removals = [];
    const captureCalls = [];
    const releaseCalls = [];
    const container = {
        ownerDocument: {},
        getBoundingClientRect: () => ({left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100}),
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
    };

    function handlePointer(type, x = 0, y = 0, pointerId = 1) {
        const event = {type, clientX: x, clientY: y, pointerId};
        handlers.get(type)?.(event);
        return event;
    }

    return {container, handlers, captures, registrations, removals, captureCalls, releaseCalls, handlePointer};
}

export function createFixture(t, options = {}) {
    const host = createContainer();
    const events = [];
    const drops = [];
    const payload = {id: 'item'};
    const engine = createDroppable({
        container: host.container,
        getPayload: () => payload,
        onChange: state => events.push(state),
        onDrop: (value, target) => drops.push({value, target, state: engine.getState()}),
        ...options,
    });
    t.after(() => engine.destroy());

    function createTarget(data, bounds = {left: 5, top: 5, right: 50, bottom: 50}) {
        const rect = {...bounds};
        const element = {getBoundingClientRect: () => ({...rect, width: rect.right - rect.left, height: rect.bottom - rect.top})};
        const remove = engine.registerTarget(element, data);
        return {element, rect, remove};
    }

    return {...host, engine, events, drops, payload, createTarget};
}
