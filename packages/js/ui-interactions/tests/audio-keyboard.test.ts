import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createFixture, createHost, settle} from './helpers/audio.ts';

test('audio shortcut listing covers the existing keys and returns independent arrays', function (t) {
    const f = createFixture(t, {keyboardSeekStep: 7});
    const entries = f.engine.listKeyboardShortcuts();
    assert.deepEqual(entries.map(entry => entry.id), ['toggle-play', 'seek-backward', 'seek-forward', 'increase-volume', 'decrease-volume', 'toggle-mute', 'seek-to-start', 'seek-to-percent', 'seek-to-end']);
    assert.deepEqual(entries.map(entry => entry.keys), [['Space'], ['ArrowLeft'], ['ArrowRight'], ['ArrowUp'], ['ArrowDown'], ['M'], ['0', 'Home'], ['1', '2', '3', '4', '5', '6', '7', '8', '9'], ['End']]);
    assert.equal(entries[1].message, 'Seek backward 7 seconds');
    entries[0].keys.push('X');
    entries[1].message = 'changed';
    assert.deepEqual(f.engine.listKeyboardShortcuts()[0].keys, ['Space']);
    assert.equal(f.engine.listKeyboardShortcuts()[1].message, 'Seek backward 7 seconds');
});

test('audio shortcuts execute all listed actions on the chosen player container', async function (t) {
    const host = createHost({audio: {currentTime: 50, volume: 0.5}});
    const f = createFixture(t, {playerContainer: host.container, keyboardSeekStep: 7, keyboardVolumeStep: 0.2}, host);
    for (const [key, property, expected] of [
        ['ArrowLeft', 'currentTime', 43], ['ArrowRight', 'currentTime', 50],
        ['ArrowUp', 'volume', 0.7], ['ArrowDown', 'volume', 0.49999999999999994],
        ['m', 'muted', true], ['M', 'muted', false], ['0', 'currentTime', 0],
        ['End', 'currentTime', 120], ['Home', 'currentTime', 0],
        ...Array.from({length: 9}, (_, index) => [String(index + 1), 'currentTime', (index + 1) * 12]),
    ]) {
        const event = f.container.dispatch('keydown', {key});
        assert.equal(event.defaultPrevented, true, key);
        assert.equal(f.audio[property], expected, key);
    }
    for (const key of [' ', 'Spacebar']) {
        const wasPaused = f.audio.paused;
        assert.equal(f.container.dispatch('keydown', {key}).defaultPrevented, true);
        await settle();
        assert.equal(f.audio.paused, !wasPaused);
    }
    const time = f.audio.currentTime;
    assert.equal(f.audio.dispatch('keydown', {key: 'Home'}).defaultPrevented, false);
    assert.equal(f.audio.currentTime, time);
});

test('audio keyboard ignores modifiers, editable targets, prevented and unknown keys', function (t) {
    const f = createFixture(t, {}, createHost({audio: {currentTime: 20}}));
    for (const details of [
        {metaKey: true}, {ctrlKey: true}, {altKey: true}, {defaultPrevented: true},
        {target: {isContentEditable: true, tagName: 'DIV'}},
        ...['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].map(tagName => ({target: {tagName}})),
        {key: 'Escape'}, {key: 'Enter'},
    ]) {
        const event = f.audio.dispatch('keydown', {key: 'ArrowRight', ...details});
        assert.equal(f.audio.currentTime, 20);
        assert.equal(event.defaultPrevented, Boolean(details.defaultPrevented));
    }
    for (const details of [{target: null}, {target: {tagName: 'SPAN'}}, {shiftKey: true}]) {
        assert.equal(f.audio.dispatch('keydown', {key: 'ArrowRight', ...details}).defaultPrevented, true);
    }
    assert.equal(f.audio.currentTime, 35);
    assert.equal(f.engine.setKeyboardShortcuts(false), true);
    assert.equal(f.audio.dispatch('keydown', {key: 'Home'}).defaultPrevented, false);
    assert.equal(f.audio.currentTime, 35);
    assert.equal(f.engine.setKeyboardShortcuts(true), true);
    assert.equal(f.audio.dispatch('keydown', {key: 'Home'}).defaultPrevented, true);
    assert.equal(f.audio.currentTime, 0);
});
