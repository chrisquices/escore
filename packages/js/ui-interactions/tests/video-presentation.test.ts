import assert from 'node:assert/strict';
import {test} from 'node:test';
import {applyPresentation, createDeferred, createFixture, createHost} from './helpers/video.ts';

test('video fullscreen chooses standard, WebKit document or iOS video capabilities', async function (t) {
    for (const variant of ['standard', 'webkit', 'ios']) {
        const host = createHost();
        const calls = applyPresentation(host, variant);
        const f = createFixture(t, {playerContainer: host.container}, host);
        assert.equal(f.engine.getState().fullscreenSupported, true);
        assert.equal(await f.engine.exitFullscreen(), true);
        assert.equal(await f.engine.enterFullscreen(), true);
        assert.equal(f.engine.getState().fullscreen, true);
        assert.equal(await f.engine.enterFullscreen(), true);
        if (variant !== 'ios') assert.equal(f.ownerDocument[variant === 'standard' ? 'fullscreenElement' : 'webkitFullscreenElement'], f.container);
        assert.equal(await f.engine.exitFullscreen(), true);
        assert.equal(f.engine.getState().fullscreen, false);
        assert.equal(await f.engine.exitFullscreen(), true);
        assert.deepEqual(calls, ['enter-fullscreen', 'exit-fullscreen']);
        assert.deepEqual(f.events.map(state => state.fullscreen), [true, false]);
    }
});

test('video fullscreen state observes native document and iOS events without duplicates', function (t) {
    const f = createFixture(t);
    f.ownerDocument.fullscreenElement = {};
    f.ownerDocument.dispatch('fullscreenchange');
    assert.equal(f.engine.getState().fullscreen, false);
    assert.equal(f.events.length, 0);
    f.ownerDocument.fullscreenElement = f.video;
    f.ownerDocument.dispatch('fullscreenchange');
    f.ownerDocument.dispatch('fullscreenchange');
    assert.equal(f.events.length, 1);
    f.ownerDocument.fullscreenElement = null;
    f.ownerDocument.webkitFullscreenElement = f.video;
    f.ownerDocument.dispatch('webkitfullscreenchange');
    assert.equal(f.events.length, 1);
    f.ownerDocument.webkitFullscreenElement = null;
    f.video.webkitDisplayingFullscreen = true;
    f.video.dispatch('webkitbeginfullscreen');
    assert.equal(f.events.length, 1);
    f.video.webkitDisplayingFullscreen = false;
    f.video.dispatch('webkitendfullscreen');
    assert.equal(f.events.length, 2);
    assert.equal(f.events.at(-1).fullscreen, false);
});

test('video picture-in-picture requires complete support and owns only its active element', async function (t) {
    const host = createHost();
    const calls = applyPresentation(host);
    const f = createFixture(t, {}, host);
    assert.equal(f.engine.getState().pictureInPictureSupported, true);
    f.ownerDocument.pictureInPictureElement = {};
    assert.equal(await f.engine.exitPictureInPicture(), true);
    assert.deepEqual(calls, []);
    assert.equal(await f.engine.enterPictureInPicture(), true);
    assert.equal(await f.engine.enterPictureInPicture(), true);
    assert.equal(f.engine.getState().pictureInPicture, true);
    f.video.dispatch('enterpictureinpicture');
    assert.equal(f.events.length, 1);
    assert.equal(await f.engine.exitPictureInPicture(), true);
    f.video.dispatch('leavepictureinpicture');
    assert.deepEqual(f.events.map(state => state.pictureInPicture), [true, false]);
    assert.deepEqual(calls, ['enter-pip', 'exit-pip']);
    for (const [object, property, disabled] of [
        [f.ownerDocument, 'pictureInPictureEnabled', false], [f.ownerDocument, 'exitPictureInPicture', undefined],
        [f.video, 'requestPictureInPicture', undefined], [f.video, 'disablePictureInPicture', true],
    ]) {
        const previous = object[property];
        object[property] = disabled;
        assert.equal(f.engine.getState().pictureInPictureSupported, false);
        assert.equal(await f.engine.enterPictureInPicture(), false);
        object[property] = previous;
    }
});

test('video presentation operations return false for unavailable or rejected browser APIs', async function (t) {
    const unavailable = createFixture(t);
    assert.equal(await unavailable.engine.enterFullscreen(), false);
    assert.equal(await unavailable.engine.enterPictureInPicture(), false);
    unavailable.ownerDocument.fullscreenElement = unavailable.video;
    assert.equal(await unavailable.engine.exitFullscreen(), false);
    for (const [method, target, nativeMethod, active] of [
        ['enterFullscreen', 'video', 'requestFullscreen', false], ['exitFullscreen', 'ownerDocument', 'exitFullscreen', true],
        ['enterPictureInPicture', 'video', 'requestPictureInPicture', false], ['exitPictureInPicture', 'ownerDocument', 'exitPictureInPicture', true],
    ]) {
        const host = createHost();
        applyPresentation(host);
        if (active) { host.ownerDocument.fullscreenElement = host.video; host.ownerDocument.pictureInPictureElement = host.video; }
        host[target][nativeMethod] = () => Promise.reject(new Error('denied'));
        const f = createFixture(t, {}, host);
        assert.equal(await f.engine[method](), false, method);
        assert.deepEqual(f.events, []);
        assert.deepEqual(f.errors, []);
    }
});

test('video pending presentation completions cannot notify after teardown', async function (t) {
    for (const [method, target, nativeMethod, active] of [
        ['enterFullscreen', 'video', 'requestFullscreen', false], ['exitFullscreen', 'ownerDocument', 'exitFullscreen', true],
        ['enterPictureInPicture', 'video', 'requestPictureInPicture', false], ['exitPictureInPicture', 'ownerDocument', 'exitPictureInPicture', true],
    ]) {
        const host = createHost();
        applyPresentation(host);
        if (active) { host.ownerDocument.fullscreenElement = host.video; host.ownerDocument.pictureInPictureElement = host.video; }
        const deferred = createDeferred();
        host[target][nativeMethod] = () => deferred.promise;
        const f = createFixture(t, {}, host);
        const pending = f.engine[method]();
        f.engine.destroy();
        deferred.resolve();
        assert.equal(await pending, false, method);
        assert.deepEqual(f.events, []);
        assert.deepEqual(f.errors, []);
    }
});
