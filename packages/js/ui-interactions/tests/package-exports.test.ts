import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createAudio} from 'strata-packages/ui-interactions/audio';
import {createVideo} from 'strata-packages/ui-interactions/video';
import {createSelection} from 'strata-packages/ui-interactions/selection';
import {createDraggable} from 'strata-packages/ui-interactions/draggable';
import {createDroppable} from 'strata-packages/ui-interactions/droppable';
import {createDropzone} from 'strata-packages/ui-interactions/dropzone';
import {createVirtualizer} from 'strata-packages/ui-interactions/virtualize';

function mediaFixture() {
    const document = Object.assign(new EventTarget(), {
        defaultView: {navigator: {}, localStorage: {getItem: () => null}},
        createElement: (tag: string) => Object.assign(new EventTarget(), {tag, src: '', type: ''}),
    });
    const sources: Array<{src: string; type: string; remove?: () => void}> = [];
    const media = Object.assign(new EventTarget(), {
        ownerDocument: document, loop: false, paused: true, ended: false, seeking: false,
        duration: 120, currentTime: 0, playbackRate: 1, volume: 1, muted: false,
        readyState: 4, networkState: 1, buffered: {length: 0}, currentSrc: '', src: '',
        videoWidth: 640, videoHeight: 360, textTracks: [],
        pause() { this.paused = true; },
        async play() { this.paused = false; },
        load() {},
        getAttribute() { return null; },
        removeAttribute() {},
        querySelector() { return null; },
        querySelectorAll() { return [...sources]; },
        appendChild(source) {
            source.remove = () => sources.splice(sources.indexOf(source), 1);
            sources.push(source);
        },
        insertBefore(source) { this.appendChild(source); },
    });
    return {media, sources};
}

test('package subpaths load TypeScript engines without a build', () => {
    for (const factory of [createAudio, createVideo, createSelection, createDraggable, createDroppable, createDropzone, createVirtualizer]) {
        assert.equal(typeof factory, 'function');
    }
    const selection = createSelection({count: 3, getItemKey: index => `item-${index}`, mode: 'multi'});
    selection.selectRange(0, 2);
    assert.deepEqual(selection.getState().selected, ['item-0', 'item-1', 'item-2']);
    selection.destroy();
});

for (const [name, createMedia] of [['audio', createAudio], ['video', createVideo]] as const) {
    test(`${name} validates replacement sources and preserves playback settings`, () => {
        const {media, sources} = mediaFixture();
        const engine = createMedia(media);
        media.playbackRate = 1.5;
        assert.equal(engine.setSources([{src: '/clip', type: `${name}/example`}]), true);
        assert.equal(sources[0].src, '/clip');
        assert.equal(media.playbackRate, 1.5);
        assert.throws(() => engine.setSources([{src: ''}]), /non-empty src/);
        engine.destroy();
    });

    test(`${name} recognizes named playback errors without relying on their realm`, async () => {
        const {media} = mediaFixture();
        const errors: Array<{id: string}> = [];
        media.play = async () => { throw {name: 'NotAllowedError'}; };
        const engine = createMedia(media, {onError: error => errors.push(error)});
        assert.equal(await engine.play(), false);
        assert.equal(errors[0].id, 'playback-blocked');
        engine.destroy();
    });
}
