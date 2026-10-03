import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createVideo} from 'strata-packages/ui-interactions/video';
import {createFixture, createHost} from './helpers/video.ts';

const captions = [
    {src: 'en.vtt', language: 'en', label: 'English', default: true},
    {src: 'es.vtt', language: 'es', label: 'Español', kind: 'captions'},
];

test('video validates caption shapes, required fields, kinds and duplicate sources before setup', function () {
    const valid = {src: 'a.vtt', language: 'en', label: 'English'};
    const invalid = [null, {}, [null], ['caption'], [{}], ...['src', 'language', 'label'].flatMap(key => [
        [{...valid, [key]: ''}], [{...valid, [key]: 1}],
    ]), [{...valid, kind: 'metadata'}], [{...valid, default: 1}], [valid, {...valid}]];
    for (const value of invalid) {
        const host = createHost();
        assert.throws(() => createVideo(host.video, {captions: value}), /createVideo:/);
        assert.equal(host.video.registrations.length, 0);
        assert.equal(host.created.length, 0);
    }
});

test('video mounts configured caption tracks in its owning document and synchronizes modes', function (t) {
    const f = createFixture(t, {captions});
    const [english, spanish] = f.children;
    assert.equal(english.ownerDocument, f.ownerDocument);
    assert.deepEqual(f.children.map(track => [track.tagName, track.src, track.srclang, track.label, track.kind, track.default, track.track.mode]), [
        ['TRACK', 'en.vtt', 'en', 'English', 'subtitles', true, 'showing'],
        ['TRACK', 'es.vtt', 'es', 'Español', 'captions', false, 'disabled'],
    ]);
    assert.equal(f.engine.getState().captions.src, 'en.vtt');
    assert.deepEqual(f.events, []);
    const selected = f.engine.getState().captions.tracks[1];
    assert.equal(f.engine.setCaption(selected), true);
    selected.label = 'caller mutation';
    assert.equal(f.engine.getState().captions.label, 'Español');
    assert.deepEqual(f.children.map(track => track.track.mode), ['disabled', 'showing']);
    assert.equal(f.events.length, 1);
    f.engine.setCaption(f.engine.getState().captions.tracks[1]);
    assert.equal(f.events.length, 1);
    assert.equal(f.engine.setCaption(null), true);
    assert.equal(f.engine.setCaption(null), true);
    assert.deepEqual(f.children.map(track => track.track.mode), ['disabled', 'disabled']);
    assert.equal(f.engine.getState().captions.enabled, false);
    assert.equal(f.events.length, 2);
    // DOM src is resolved to an absolute URL; selection follows the configured src.
    english.src = 'https://video.test/player/en.vtt';
    f.engine.setCaption(f.engine.getState().captions.tracks[0]);
    assert.equal(english.track.mode, 'showing');
    spanish.track = null;
    english.dispatch('load');
    assert.equal(english.track.mode, 'showing');
});

test('video caption load events publish ready state and isolate load errors', function (t) {
    const logged = t.mock.method(console, 'error', () => {});
    const f = createFixture(t, {captions, onError() { throw new Error('consumer'); }});
    const track = f.children[0];
    track.readyState = 2;
    track.track.mode = 'disabled';
    track.dispatch('load');
    assert.equal(track.track.mode, 'showing');
    assert.equal(f.events.length, 1);
    assert.equal(f.events[0].captions.tracks[0].readyState, 2);
    track.dispatch('load');
    assert.equal(f.events.length, 1);
    track.kind = 'captions';
    f.video.dispatch('progress');
    assert.equal(f.events.at(-1).captions.tracks[0].kind, 'captions');
    track.dispatch('error');
    assert.deepEqual(f.errors, [{id: 'caption-load-failed', message: 'The English captions could not be loaded.', metadata: null}]);
    assert.equal(logged.mock.callCount(), 1);
});

test('video persisted caption choices use current configured metadata and reject stale or malformed storage', function (t) {
    const cases = [
        [null, ''],
        [{src: 'es.vtt', language: 'forged', label: 'Old label'}, 'es.vtt'],
        [{src: 'missing.vtt', language: 'old', label: 'Old track'}, ''],
        [[], 'en.vtt'], [1, 'en.vtt'], [{}, 'en.vtt'], [{src: 3}, 'en.vtt'],
    ];
    for (const [selectedCaption, expected] of cases) {
        const f = createFixture(t, {captions, persistSettings: true}, createHost({storage: {'strata-settings': JSON.stringify({selectedCaption})}}));
        const state = f.engine.getState().captions;
        assert.equal(state.src, expected);
        assert.equal(state.enabled, Boolean(expected));
        if (expected === 'es.vtt') assert.equal(state.label, 'Español');
        assert.equal(f.children.filter(track => track.track.mode === 'showing').length, expected ? 1 : 0);
        assert.deepEqual(f.storage.writes, []);
    }
    const f = createFixture(t, {captions, persistSettings: true});
    const selected = f.engine.getState().captions.tracks[1];
    f.engine.setCaption(selected);
    assert.deepEqual(JSON.parse(f.storage.values.get('strata-settings')).selectedCaption, selected);
    f.engine.setCaption(null);
    assert.equal(JSON.parse(f.storage.values.get('strata-settings')).selectedCaption, null);
});

test('video source changes preserve tracks and teardown removes only owned caption nodes', function (t) {
    const host = createHost();
    const external = host.ownerDocument.createElement('track');
    host.video.appendChild(external);
    const f = createFixture(t, {captions, sources: [{src: 'one.mp4'}]}, host);
    const owned = f.children.filter(child => child.tagName === 'TRACK' && child !== external);
    const removedSource = f.children[0];
    f.engine.setSources([{src: 'two.mp4'}, {src: 'two.webm', type: 'video/webm'}]);
    assert.equal(removedSource.parentNode, null);
    assert.deepEqual(f.children.map(child => child.tagName), ['SOURCE', 'SOURCE', 'TRACK', 'TRACK', 'TRACK']);
    assert.equal(owned[0].track.mode, 'showing');
    f.engine.destroy();
    assert.ok(f.children.includes(external));
    assert.equal(f.children.filter(child => child.tagName === 'SOURCE').length, 2);
    for (const track of owned) {
        assert.equal(track.parentNode, null);
        assert.deepEqual(track.removals, track.registrations);
        for (const {handler, type} of track.registrations) handler({type});
    }
    assert.deepEqual(f.errors, []);
});

test('video every caption reader and subscriber owns its nested tracks', function (t) {
    const f = createFixture(t, {captions});
    const delivered = [];
    f.engine.subscribe(state => { state.captions.tracks[0].label = 'poison'; state.captions.tracks.pop(); });
    f.engine.subscribe(state => delivered.push(state));
    f.engine.setCaption(f.engine.getState().captions.tracks[1]);
    assert.deepEqual(delivered[0].captions, f.engine.getState().captions);
    assert.notEqual(delivered[0].captions.tracks[0], f.events[0].captions.tracks[0]);
    const read = f.engine.getState();
    read.captions.tracks[0].src = 'poison';
    read.captions.tracks.length = 0;
    assert.equal(f.engine.getState().captions.tracks[0].src, 'en.vtt');
});
