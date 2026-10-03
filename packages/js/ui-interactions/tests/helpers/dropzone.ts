import {setImmediate} from 'node:timers/promises';
import {createDropzone} from 'strata-packages/ui-interactions/dropzone';

// Controlled event targets retain exact listener identities for teardown and late-event tests.
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
        emit(type, values = {}) {
            const event = {type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...values};
            for (const handler of [...(handlers.get(type) ?? [])]) {
                if (handlers.get(type).has(handler)) handler(event);
            }
            return event;
        },
    };
}

export function createHost() {
    const window = createTarget();
    const document = {...createTarget(), defaultView: window};
    const picker = {...createTarget(), files: null, value: '', clicks: 0, click() { this.clicks++; }};
    const videos = [];
    const canvases = [];
    const canvasOptions = {context: true, drawError: null, deferBlob: false, blob: new Blob(['frame'], {type: 'image/png'})};
    const created = [];
    document.createElement = function (tag) {
        created.push(tag);
        if (tag === 'input') return picker;
        if (tag === 'video') {
            const video = {
                ...createTarget(), duration: 8, videoWidth: 320, videoHeight: 180, currentTime: 0,
                pauses: 0, loads: 0, removed: [],
                pause() { this.pauses++; },
                load() { this.loads++; },
                removeAttribute(name) { this.removed.push(name); delete this[name]; },
            };
            videos.push(video);
            return video;
        }
        if (tag === 'canvas') {
            const canvas = {
                draws: [], callbacks: [],
                getContext(kind) {
                    if (kind !== '2d' || !canvasOptions.context) return null;
                    return {drawImage(...args) {
                        if (canvasOptions.drawError) throw canvasOptions.drawError;
                        canvas.draws.push(args);
                    }};
                },
                toBlob(callback) {
                    this.callbacks.push(callback);
                    if (!canvasOptions.deferBlob) callback(canvasOptions.blob);
                },
            };
            canvases.push(canvas);
            return canvas;
        }
        throw new Error(`Unexpected element: ${tag}`);
    };
    const element = {...createTarget(), ownerDocument: document};
    return {element, document, window, picker, videos, canvases, canvasOptions, created};
}

export function createFixture(t, options = {}, host = createHost()) {
    const events = [];
    const errors = [];
    const {onChange, onError, ...config} = options;
    const engine = createDropzone(host.element, {
        ...config,
        onChange(state) { events.push(state); onChange?.(state); },
        onError(error) { errors.push(error); onError?.(error); },
    });
    t.after(() => engine.destroy());
    return {...host, engine, events, errors};
}

export function file(name = 'file.txt', size = 4, type = 'text/plain') {
    return new File([new Uint8Array(size)], name, {type, lastModified: 123});
}

export function fileList(files) {
    return Object.assign({length: files.length, item(index) { return files[index] ?? null; }}, files);
}

export function transfer(files = [], values = {}) {
    return {types: ['Files'], files: fileList(files), items: [], dropEffect: 'move', ...values};
}

export function fileEntry(value, fail = false) {
    return {isFile: true, file(success, failure) { if (fail) failure(new Error('unreadable')); else success(value); }};
}

export function directoryEntry(batches) {
    return {isFile: false, createReader() {
        let index = 0;
        return {readEntries(success, failure) {
            const batch = batches[index++] ?? [];
            if (batch instanceof Error) failure(batch);
            else success(batch);
        }};
    }};
}

export function entryItem(entry) {
    return {kind: 'file', webkitGetAsEntry: () => entry};
}

export const settle = () => setImmediate();

export function mockUrls(t) {
    const created = [];
    const revoked = [];
    t.mock.method(URL, 'createObjectURL', blob => {
        const url = `blob:dropzone-${created.length + 1}`;
        created.push({url, blob});
        return url;
    });
    t.mock.method(URL, 'revokeObjectURL', url => revoked.push(url));
    return {created, revoked};
}

export function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return {promise, resolve, reject};
}

// The fixtures intentionally cover only the existing ID3v2.3/v2.4 APIC subset.
export function id3Size(size, base = 128) {
    return [Math.floor(size / base ** 3) % base, Math.floor(size / base ** 2) % base, Math.floor(size / base) % base, size % base];
}

export function artworkFrame({version = 3, mime = 'image/jpeg', encoding = 0, pictureType = 3, description, picture, id = 'APIC', flags = 0} = {}) {
    const pixels = picture ?? (mime === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10, 1] : [255, 216, 255, 1]);
    const text = description ?? (encoding === 1 || encoding === 2 ? [0, 0] : [0]);
    const payload = [encoding, ...new TextEncoder().encode(mime), 0, pictureType, ...text, ...pixels];
    return [...new TextEncoder().encode(id), ...id3Size(payload.length, version === 4 ? 128 : 256), 0, flags, ...payload];
}

export function audioFile(frames = [artworkFrame()], {version = 3, revision = 0, flags = 0, size, signature = 'ID3'} = {}) {
    const payload = frames.flat();
    return new File([new Uint8Array([...new TextEncoder().encode(signature), version, revision, flags, ...id3Size(size ?? payload.length), ...payload])], 'track.mp3', {type: 'audio/mpeg'});
}
