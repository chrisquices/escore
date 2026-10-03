import {createAudio} from 'strata-packages/ui-interactions/audio';

const workletGlobals = new WeakMap();

export function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return {promise, resolve, reject};
}

export async function settle() {
    // Worklet ready messages and playback continuations use microtasks, not real timers.
    for (let index = 0; index < 12; index++) await Promise.resolve();
}

export function createTarget() {
    const handlers = new Map();
    const registrations = [];
    const removals = [];
    return {
        handlers, registrations, removals,
        addEventListener(type, handler, options) {
            registrations.push({type, handler, options});
            if (!handlers.has(type)) handlers.set(type, new Set());
            handlers.get(type).add(handler);
        },
        removeEventListener(type, handler, options) {
            removals.push({type, handler, options});
            handlers.get(type)?.delete(handler);
        },
        dispatch(type, details = {}) {
            const event = {type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...details};
            for (const handler of [...(handlers.get(type) || [])]) handler(event);
            return event;
        },
    };
}

export function createHost(options = {}) {
    const values = new Map(Object.entries(options.storage || {}));
    const storage = {
        values, reads: [], writes: [], removals: [], failGet: false, failSet: false, failRemove: false,
        getItem(key) { this.reads.push(key); if (this.failGet) throw new Error('storage get'); return values.get(key) ?? null; },
        setItem(key, value) { if (this.failSet) throw new Error('storage set'); this.writes.push({key, value}); values.set(key, value); },
        removeItem(key) { if (this.failRemove) throw new Error('storage remove'); this.removals.push(key); values.delete(key); },
    };
    const mediaSession = {
        metadata: null, playbackState: 'none', handlers: new Map(), actions: [], positions: [],
        setActionHandler(action, handler) { this.actions.push({action, handler}); this.handlers.set(action, handler); },
        setPositionState(position) { this.positions.push({...position}); },
    };
    const defaultView = {localStorage: storage, navigator: options.mediaSession ? {mediaSession} : {}};
    if (options.metadataConstructor) {
        defaultView.MediaMetadata = function (metadata) { Object.assign(this, metadata); };
    }
    const children = [];
    const created = [];
    const ownerDocument = {
        baseURI: 'https://audio.test/player/', defaultView,
        createElement(tag) {
            const source = {tagName: tag.toUpperCase(), src: '', type: '', remove() { children.splice(children.indexOf(this), 1); }};
            created.push(source);
            return source;
        },
    };
    let ranges = options.ranges || [];
    const audio = {
        ...createTarget(), ownerDocument, tagName: 'AUDIO', src: 'https://audio.test/song.mp3', currentSrc: '',
        paused: true, ended: false, seeking: false, duration: 120, currentTime: 0,
        volume: 1, muted: false, playbackRate: 1, loop: false, crossOrigin: '', preservesPitch: false,
        webkitPreservesPitch: false, mozPreservesPitch: false, error: null,
        loadCalls: 0, playCalls: 0, pauseCalls: 0, fastSeeks: [], playHook: null, pauseHook: null,
        buffered: {get length() { return ranges.length; }, start(index) { return ranges[index][0]; }, end(index) { return ranges[index][1]; }},
        setRanges(next) { ranges = next; },
        querySelectorAll(selector) { return selector === 'source' ? children.slice() : []; },
        appendChild(child) { children.push(child); return child; },
        removeAttribute(name) { if (name === 'src') this.src = ''; },
        load() {
            this.loadCalls++;
            this.paused = true;
            this.ended = false;
            this.currentTime = 0;
            this.playbackRate = 1;
            this.currentSrc = this.src || children[0]?.src || '';
        },
        play() {
            this.playCalls++;
            if (this.playHook) return this.playHook();
            this.paused = false;
            this.ended = false;
            return Promise.resolve();
        },
        pause() { this.pauseCalls++; this.paused = true; this.pauseHook?.(); },
        fastSeek(time) { this.fastSeeks.push(time); this.currentTime = time; },
        ...options.audio,
    };
    const container = {...createTarget(), ownerDocument, tagName: 'DIV'};
    return {audio, container, ownerDocument, defaultView, mediaSession, storage, children, created};
}

export function createFixture(t, options = {}, host = createHost()) {
    const events = [];
    const errors = [];
    const {onChange, onError, ...config} = options;
    const engine = createAudio(host.audio, {
        ...config,
        onChange(state) { events.push(state); onChange?.(state); },
        onError(error) { errors.push(error); onError?.(error); },
    });
    t.after(() => engine.destroy());
    return {...host, engine, events, errors};
}

export function createAudioContext(t, host, options = {}) {
    const contexts = [];
    const nodes = [];
    const builds = [];
    const moduleLoads = [];
    let failWorklet = options.failWorklet || false;
    if (!workletGlobals.has(t)) {
        const previousWorklet = Object.getOwnPropertyDescriptor(globalThis, 'AudioWorkletNode');
        workletGlobals.set(t, previousWorklet);
        t.after(() => {
            if (previousWorklet) Object.defineProperty(globalThis, 'AudioWorkletNode', previousWorklet);
            else delete globalThis.AudioWorkletNode;
            workletGlobals.delete(t);
        });
    }
    function createNode() {
        return {
            connections: [], disconnects: 0,
            connect(node) { this.connections.push(node); return node; },
            disconnect() { this.disconnects++; this.connections.length = 0; },
        };
    }
    class Worklet {
        constructor(context) {
            builds.push(context);
            if (failWorklet) throw new Error('worklet unavailable');
            Object.assign(this, createNode());
            this.schedules = [];
            this.port = {
                onmessage: null,
                postMessage: message => {
                    const [id, method, value] = message;
                    if (method === 'schedule') this.schedules.push(value);
                    queueMicrotask(() => this.port.onmessage?.({data: [id, true]}));
                },
            };
            nodes.push(this);
            queueMicrotask(() => this.port.onmessage?.({data: ['ready', {schedule: 1}]}));
        }
    }
    class Context {
        constructor() {
            if (options.failConstructor) throw new Error('context unavailable');
            this.state = options.state || 'suspended';
            this.currentTime = 0;
            this.destination = {destination: true};
            this.source = createNode();
            this.taps = 0;
            this.resumes = 0;
            this.closes = 0;
            this.audioWorklet = {addModule: url => {
                moduleLoads.push(url);
                if (options.modulePromise) return options.modulePromise;
                return failWorklet ? Promise.reject(new Error('registration failed')) : Promise.resolve();
            }};
            contexts.push(this);
        }
        createMediaElementSource(element) { this.taps++; this.element = element; if (options.failTap) throw new Error('tap failed'); return this.source; }
        resume() { this.resumes++; if (options.failResume) return Promise.reject(new Error('resume blocked')); this.state = 'running'; return Promise.resolve(); }
        close() { this.closes++; this.state = 'closed'; return Promise.resolve(); }
    }
    Object.defineProperty(globalThis, 'AudioWorkletNode', {value: Worklet, configurable: true, writable: true});
    host.defaultView.AudioWorkletNode = Worklet;
    host.defaultView[options.webkit ? 'webkitAudioContext' : 'AudioContext'] = Context;
    return {contexts, nodes, builds, moduleLoads, setWorkletFailure(value) { failWorklet = value; }};
}
