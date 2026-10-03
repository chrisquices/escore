import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createNotifier} from '../src/internal/core.ts';

type FrameHandle = number | {id: number};

function createFrames() {
    const pending = new Map<FrameHandle, () => void>();
    const requests: {handle: FrameHandle, callback: () => void}[] = [];
    const cancelled: FrameHandle[] = [];

    function createFrame(callback: () => void) {
        const handle = requests.length === 0 ? 0 : {id: requests.length};
        requests.push({handle, callback});
        pending.set(handle, callback);
        return handle;
    }

    function clearFrame(handle: FrameHandle) {
        cancelled.push(handle);
        pending.delete(handle);
    }

    function settleFrame() {
        for (const [handle, callback] of [...pending]) {
            if (!pending.delete(handle)) continue;
            callback();
        }
    }

    return {pending, requests, cancelled, requestFrame: createFrame, cancelFrame: clearFrame, settleFrame};
}

test('notifier validates its provider, options and subscribers without reading state', function () {
    let reads = 0;
    const getState = () => ++reads;
    for (const value of [undefined, null, false, 1, {}]) {
        assert.throws(() => createNotifier(value), {name: 'TypeError', message: "createNotifier: 'getState' must be a function."});
    }
    for (const value of [null, false, 1, 'options']) {
        assert.throws(() => createNotifier(getState, value), {name: 'TypeError', message: "createNotifier: 'config' must be an options object."});
    }
    for (const option of ['requestFrame', 'cancelFrame']) {
        for (const value of [null, false, 1, {}]) {
            assert.throws(() => createNotifier(getState, {[option]: value}), {
                name: 'TypeError', message: `createNotifier: the '${option}' option must be a function when provided.`,
            });
        }
    }
    const notifier = createNotifier(getState, {requestFrame: undefined, cancelFrame: undefined});
    for (const value of [undefined, null, false, 1, {}]) {
        assert.throws(() => notifier.subscribe(value), {name: 'TypeError', message: "createNotifier: 'listener' must be a function."});
    }
    assert.equal(reads, 0);
    notifier.destroy();
});

test('notifier is silent until signalled and reads one shared snapshot for every synchronous delivery', function () {
    let reads = 0;
    const snapshot = {nested: {value: 1}};
    const notifier = createNotifier(() => { reads++; return snapshot; });
    const first = [];
    const second = [];
    notifier.subscribe(state => first.push(state));
    notifier.subscribe(state => second.push(state));
    assert.equal(reads, 0);
    assert.deepEqual(first, []);
    assert.deepEqual(second, []);

    for (let signal = 1; signal <= 2; signal++) {
        notifier.notify();
        assert.equal(reads, signal);
        assert.equal(first.length, signal);
        assert.equal(second.length, signal);
        assert.equal(first[signal - 1], snapshot);
        assert.equal(second[signal - 1], snapshot);
    }
    notifier.destroy();
});

test('notifier duplicate subscriptions share membership and either unsubscribe handle removes it', function () {
    let state = 0;
    const notifier = createNotifier(() => ++state);
    const received = [];
    const listener = value => received.push(value);
    const first = notifier.subscribe(listener);
    const second = notifier.subscribe(listener);
    notifier.notify();
    first();
    first();
    notifier.notify();
    notifier.subscribe(listener);
    notifier.notify();
    second();
    second();
    notifier.notify();
    assert.deepEqual(received, [1, 3]);
    notifier.destroy();
});

test('notifier honors removal and addition of listeners during the same delivery', function () {
    const notifier = createNotifier(() => 1);
    const calls = [];
    const added = () => calls.push('added');
    const detachFirst = notifier.subscribe(() => {
        calls.push('first');
        detachFirst();
        detachRemoved();
        notifier.subscribe(added);
    });
    const detachRemoved = notifier.subscribe(() => calls.push('removed'));
    notifier.subscribe(() => calls.push('kept'));
    notifier.notify();
    assert.deepEqual(calls, ['first', 'kept', 'added']);
    notifier.notify();
    assert.deepEqual(calls, ['first', 'kept', 'added', 'kept', 'added']);
    notifier.destroy();
});

test('notifier isolates throwing consumers during synchronous and frame delivery', function (t) {
    const frames = createFrames();
    const logged = [];
    t.mock.method(console, 'error', (...args) => logged.push(args));
    const cause = new Error('consumer failed');
    let state = 1;
    const notifier = createNotifier(() => state, frames);
    const calls = [];
    notifier.subscribe(value => { calls.push(['throwing', value]); throw cause; });
    notifier.subscribe(value => calls.push(['later', value]));
    notifier.notify();
    state = 2;
    notifier.notifyFrame();
    frames.settleFrame();
    assert.deepEqual(calls, [['throwing', 1], ['later', 1], ['throwing', 2], ['later', 2]]);
    assert.deepEqual(logged.map(args => args[1]), [cause, cause]);
    notifier.destroy();
});

test('notifier reentrant synchronous delivery supersedes the outer snapshot for later listeners', function () {
    let state = 1;
    let reads = 0;
    const notifier = createNotifier(() => { reads++; return state; });
    const calls = [];
    notifier.subscribe(value => {
        calls.push(['first', value]);
        if (value === 1) {
            state = 2;
            notifier.notify();
        }
    });
    notifier.subscribe(value => calls.push(['later', value]));
    notifier.notify();
    assert.deepEqual(calls, [['first', 1], ['first', 2], ['later', 2]]);
    assert.equal(reads, 2);
    notifier.destroy();
});

test('notifier coalesces frame bursts into the latest state and can schedule the next frame', function () {
    const frames = createFrames();
    let state = 0;
    let reads = 0;
    const notifier = createNotifier(() => { reads++; return state; }, frames);
    const received = [];
    notifier.subscribe(value => received.push(value));
    for (const value of [1, 2, 3]) {
        state = value;
        notifier.notifyFrame();
    }
    assert.equal(frames.requests.length, 1);
    assert.equal(frames.requests[0].handle, 0);
    assert.equal(frames.pending.size, 1);
    assert.equal(reads, 0);
    assert.deepEqual(received, []);
    frames.settleFrame();
    assert.deepEqual(received, [3]);
    assert.equal(reads, 1);
    assert.equal(frames.pending.size, 0);
    state = 4;
    notifier.notifyFrame();
    assert.equal(frames.requests.length, 2);
    assert.equal(typeof frames.requests[1].handle, 'object');
    frames.settleFrame();
    assert.deepEqual(received, [3, 4]);
    assert.equal(reads, 2);
    notifier.destroy();
});

for (const cancel of [true, false]) {
    test(`notifier synchronous delivery supersedes a pending frame ${cancel ? 'with' : 'without'} cancellation`, function () {
        const frames = createFrames();
        let state = 1;
        let reads = 0;
        const notifier = createNotifier(() => { reads++; return state; }, {
            requestFrame: frames.requestFrame,
            cancelFrame: cancel ? frames.cancelFrame : undefined,
        });
        const received = [];
        notifier.subscribe(value => received.push(value));
        notifier.notifyFrame();
        state = 2;
        notifier.notify();
        assert.deepEqual(received, [2]);
        assert.equal(reads, 1);
        assert.deepEqual(frames.cancelled, cancel ? [0] : []);
        assert.equal(frames.pending.size, cancel ? 0 : 1);
        frames.settleFrame();
        assert.deepEqual(received, [2]);
        assert.equal(reads, 1);

        state = 3;
        notifier.notifyFrame();
        state = 4;
        notifier.notify();
        state = 5;
        notifier.notifyFrame();
        assert.equal(frames.requests.length, cancel ? 3 : 2);
        if (cancel) assert.equal(frames.cancelled[1], frames.requests[1].handle);
        frames.settleFrame();
        assert.deepEqual(received, [2, 4, 5]);
        assert.equal(reads, 3);
        notifier.destroy();
    });
}

for (const initial of ['notify', 'notifyFrame'] as const) {
    test(`notifier can schedule a reentrant frame during ${initial} delivery`, function () {
        const frames = createFrames();
        let state = 1;
        const notifier = createNotifier(() => state, frames);
        const calls = [];
        notifier.subscribe(value => {
            calls.push(['first', value]);
            if (value === 1) {
                state = 2;
                notifier.notifyFrame();
            }
        });
        notifier.subscribe(value => calls.push(['later', value]));
        notifier[initial]();
        if (initial === 'notifyFrame') frames.settleFrame();
        assert.deepEqual(calls, [['first', 1]]);
        assert.equal(frames.pending.size, 1);
        assert.equal(frames.requests.length, initial === 'notifyFrame' ? 2 : 1);
        frames.settleFrame();
        assert.deepEqual(calls, [['first', 1], ['first', 2], ['later', 2]]);
        assert.equal(frames.pending.size, 0);
        notifier.destroy();
    });
}

test('notifier notifyFrame falls back to synchronous delivery without a scheduler', function () {
    let reads = 0;
    const cancelled = [];
    const notifier = createNotifier(() => { reads++; return 1; }, {cancelFrame: handle => cancelled.push(handle)});
    const received = [];
    notifier.subscribe(value => received.push(value));
    notifier.notifyFrame();
    assert.deepEqual(received, [1]);
    notifier.notifyFrame();
    assert.deepEqual(received, [1, 1]);
    assert.equal(reads, 2);
    notifier.destroy();
    assert.deepEqual(cancelled, []);
});

test('notifier provider reentrancy must not revive an already delivered pending frame', function () {
    const frames = createFrames();
    let reads = 0;
    let reentered = false;
    const notifier = createNotifier(() => {
        const snapshot = ++reads;
        if (!reentered) {
            reentered = true;
            notifier.notify();
        }
        return snapshot;
    }, {requestFrame: frames.requestFrame});
    const received = [];
    notifier.subscribe(value => received.push(value));
    notifier.notifyFrame();
    notifier.notify();
    assert.equal(reads, 2);
    assert.deepEqual(received, [2]);
    frames.settleFrame();
    assert.equal(reads, 2, 'the pending frame has already been superseded by the nested delivery');
    assert.deepEqual(received, [2]);
    notifier.destroy();
});

for (const cancel of [true, false]) {
    test(`notifier destruction is idempotent and retained frames stay inert ${cancel ? 'with' : 'without'} cancellation`, function () {
        const frames = createFrames();
        let reads = 0;
        const notifier = createNotifier(() => ++reads, {
            requestFrame: frames.requestFrame,
            cancelFrame: cancel ? frames.cancelFrame : undefined,
        });
        const received = [];
        const unsubscribe = notifier.subscribe(value => received.push(value));
        notifier.notifyFrame();
        frames.settleFrame();
        notifier.notifyFrame();
        const retained = frames.requests[1];
        notifier.destroy();
        notifier.destroy();
        assert.equal(frames.cancelled.length, cancel ? 1 : 0);
        if (cancel) assert.equal(frames.cancelled[0], retained.handle);
        const late = notifier.subscribe(value => received.push(value));
        unsubscribe();
        unsubscribe();
        late();
        late();
        notifier.notify();
        notifier.notifyFrame();
        frames.settleFrame();
        retained.callback();
        assert.equal(reads, 1);
        assert.deepEqual(received, [1]);
        assert.equal(frames.requests.length, 2);
        assert.equal(frames.pending.size, 0);
        assert.equal(frames.cancelled.length, cancel ? 1 : 0);
    });
}

test('notifier destruction during consumer delivery stops later listeners and future reads', function () {
    let reads = 0;
    const notifier = createNotifier(() => ++reads);
    const calls = [];
    notifier.subscribe(value => { calls.push(['first', value]); notifier.destroy(); });
    notifier.subscribe(value => calls.push(['later', value]));
    notifier.notify();
    notifier.notify();
    notifier.notifyFrame();
    assert.deepEqual(calls, [['first', 1]]);
    assert.equal(reads, 1);
});

test('notifier destruction during its state provider suppresses the pending delivery', function () {
    let reads = 0;
    const notifier = createNotifier(() => { reads++; notifier.destroy(); return 1; });
    const received = [];
    notifier.subscribe(value => received.push(value));
    notifier.notify();
    notifier.notify();
    notifier.notifyFrame();
    assert.equal(reads, 1);
    assert.deepEqual(received, []);
});

test('notifier instances keep subscriptions, frames and destruction independent', function () {
    const frames = createFrames();
    const reads = [0, 0];
    const first = createNotifier(() => { reads[0]++; return 'first'; }, frames);
    const second = createNotifier(() => { reads[1]++; return 'second'; }, frames);
    const received = [];
    const listener = value => received.push(value);
    first.subscribe(listener);
    second.subscribe(listener);
    first.notifyFrame();
    second.notifyFrame();
    assert.equal(frames.pending.size, 2);
    first.destroy();
    assert.deepEqual(frames.cancelled, [frames.requests[0].handle]);
    assert.equal(frames.pending.size, 1);
    frames.settleFrame();
    first.notify();
    second.notify();
    assert.deepEqual(reads, [0, 2]);
    assert.deepEqual(received, ['second', 'second']);
    second.destroy();
});
