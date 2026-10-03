# Image regression contract

`image.ts` is feature-complete. Future source changes should be limited to reproducible bug fixes, accompanied by regression coverage.

Run the complete image suite from `packages/js` with Node 22.18 or newer (native TypeScript stripping):

```sh
npm run test:ui-interactions
npm run typecheck:ui-interactions
```

The TypeScript configuration checks every authored engine and shared helper directly. Public types live in the TypeScript sources; there are no sibling declaration files. The generated third-party Signalsmith payload is preserved in `src/internal/vendor/signalsmith-stretch.ts` and excluded from semantic checking with a file-level directive; the audio engine uses a typed interface for it.

The tests use Node's built-in runner and `@napi-rs/canvas` for real pixel processing. Canvas is test tooling only; the engine has no new runtime dependency.

Coverage includes document and layer mutations, modifier histories, global history and transactions, persistence and source resolution, rendering and preview proxies, crop/straighten/color sampling, coordinate conversion, notification cache invalidation, frame batching, and teardown.

Large-history checks verify frozen operation identity reuse, guard against copying old point arrays or serializing state during updates, and exercise local branching and global restoration. They use deterministic assertions rather than elapsed-time thresholds. Public `getState()` is checked separately for fresh, independent copies.

Browser event targets, resize observation, and frame scheduling are controlled by the fixture. Canvas pixels are produced by the native Canvas implementation; these tests do not replace browser UI or cross-browser integration tests. Small tolerances are used only for native alpha-compositing rounding.

## Shared notifier regression contract

`core-notifier.test.ts` exercises `createNotifier` directly: validation, silent construction and subscription, synchronous signals, shared snapshot identity, listener membership, callback isolation, reentrant delivery, frame coalescing, synchronous supersession, scheduler fallback, teardown and independent instances.

Run this suite from `packages/js` with Node 22.18 or newer:

```sh
node --test ui-interactions/tests/core-notifier.test.ts
```

It also runs under `npm run test:ui-interactions`. The local deterministic frame fixture uses zero and opaque object handles, tracks cancellation and retains callbacks for teardown checks. Assertions count reads, deliveries and scheduled frames; they do not use elapsed-time thresholds or model browser animation timing.

The notifier delivers explicit signals even when state is equal, reads one snapshot per delivery and passes that same snapshot to its listeners. Engine suites retain responsibility for no-op suppression, snapshot copying or freezing, and browser integration. This direct suite adds no public API or shared helper behavior.

The provider-reentrancy regression guarantees that, with a pending frame and no cancellation function, a state provider's nested synchronous notification supersedes the outer delivery without letting it overwrite the newer emitted revision. The pending frame then completes without another state read or delivery.

## Droppable regression contract

The droppable suites exercise the existing public API through controlled pointer events and target rectangles:

- `droppable-config.test.ts`: constructor options, callback and target validation, defaults, and setup failures.
- `droppable-gestures.test.ts`: payload resolution, radial thresholds, pointer ownership, capture, cancellation, and successive gestures.
- `droppable-targets.test.ts`: nested targets, boundary coordinates, changing geometry, registration, unregistration, and rejected drops.
- `droppable-notifications.test.ts`: synchronous state delivery, no-op silence, opaque payloads, subscriptions, callback isolation, and reentrant delivery.
- `droppable-lifecycle.test.ts`: exact listener cleanup, late events, independent instances, coordinate ownership, and destruction during callbacks or a drag.

Run only these suites from `packages/js`:

```sh
node --test ui-interactions/tests/droppable-*.test.ts
```

To measure the engine's executed lines, branches, and functions:

```sh
node --test --experimental-test-coverage --test-coverage-include='**/src/droppable.ts' ui-interactions/tests/droppable-*.test.ts
```

They also run under `npm run test:ui-interactions`. The shared fixture tracks listener identities, listener options, and pointer capture explicitly; it does not simulate browser layout or prove browser pointer-event behavior. Notification cost is checked by rejecting serialization rather than using timing thresholds. Payload and target data remain opaque caller-owned references.

Coverage percentages describe exercised code, not correctness. Contract tests guard pointer capture release on destruction, independent coordinate snapshots for state reads and each subscriber, and suppression of a pending drop when a settled-state subscriber destroys the engine.

## Draggable regression contract

The draggable suites exercise the existing public API through controlled element geometry and pointer events:

- `draggable-config.test.ts`: option and setter validation, defaults, initial size capture, and synchronous initial state.
- `draggable-drag.test.ts`: handle resolution, thresholds, axes, pointer ownership, capture, cancellation, disabled/resumed gestures, position/reset, all bounds modes, and oversized elements.
- `draggable-resize.test.ts`: eight resize sides and cursors, allowed handles, min/max dimensions, numeric/automatic aspect ratios, bounded resize geometry, and programmatic sizing.
- `draggable-notifications.test.ts`: no-op silence after rounding or clamping, matching hover cursors, serialization avoidance, duplicate subscriptions, callback isolation, independent snapshots, and reentrant delivery.
- `draggable-lifecycle.test.ts`: exact listener cleanup, capture release, late events, independent instances, and destruction during callbacks or gestures.

Run these suites from `packages/js` with Node 22.18 or newer:

```sh
node --test ui-interactions/tests/draggable-*.test.ts
```

They also run under `npm run test:ui-interactions`. To inspect executed engine lines, branches, and functions:

```sh
node --test --experimental-test-coverage --test-coverage-include='**/src/draggable.ts' ui-interactions/tests/draggable-*.test.ts
```

The fixture applies published position and dimensions back to `getBoundingClientRect()`, like a rendering consumer. It supplies the element's own document viewport and tracks listener identities, listener options, and pointer capture explicitly. This is controlled geometry, not browser layout or cross-browser pointer-event verification. Tests cover feasible size, aspect, and bounds combinations; they do not establish a policy for contradictory constraints. Notification cost is checked by rejecting serialization rather than timing operations.

## Selection regression contract

The selection suites exercise the existing public API through controlled keyboard, focus, and pointer events:

- `selection-config.test.ts`: defaults, option validation, initial delivery, listener registration, and subscriber validation.
- `selection-api.test.ts`: single/multi modes, plain/meta/shift combinations, ranges, key membership and ordering, anchor/focus distinctions, invalid indices, provider rollback, and reentrant updates.
- `selection-keyboard.test.ts`: list/grid arrows, boundaries and partial rows, shift ranges, Space/Enter/Escape/select-all, DOM focus, interactive descendants, provider failures, and focus requests for successful no-op navigation.
- `selection-marquee.test.ts`: thresholds, scroll and border coordinates, DOM/custom hit testing, additive snapshots, empty clicks, pointer ownership, cancellation, capture failures, and reentrant providers.
- `selection-notifications.test.ts`: synchronous delivery, no-op silence, serialization avoidance, opaque key identity, independent snapshots, duplicate subscriptions, callback isolation, and reentrant delivery.
- `selection-lifecycle.test.ts`: exact listener cleanup, capture release, late events, independent instances, and destruction during providers, callbacks, or gestures.

Run these suites from `packages/js` with Node 22.18 or newer:

```sh
node --test ui-interactions/tests/selection-*.test.ts
```

They also run under `npm run test:ui-interactions`. To inspect executed engine lines, branches, and functions:

```sh
node --test --experimental-test-coverage --test-coverage-include='**/src/selection.ts' ui-interactions/tests/selection-*.test.ts
```

The fixture models the engine's observed DOM capabilities: listener identity/options, parent/child containment, the selectors used by these tests, supplied element rectangles, document focus, scrolling, borders, and pointer capture. It does not implement a full CSS selector engine, browser layout, native focus movement, event bubbling, or browser pointer capture scheduling. These tests do not replace live browser or cross-browser integration checks. Keys retain their caller-owned identity; public state arrays and rectangles are independent copies. Cost checks reject serialization and sorting on no-op updates rather than timing operations.

## Dropzone regression contract

The dropzone suites exercise the existing public API, file acquisition, and preview resource ownership:

- `dropzone-config.test.ts`: option validation, defaults, picker configuration, and setup failures.
- `dropzone-files.test.ts`: validation and limits, duplicate handling, File/FileList inputs, atomic replacement, removal, and size formatting.
- `dropzone-events.test.ts`: nested drag highlighting, disabled acquisition, picker input, document guards, file/folder collection, and collection failures.
- `dropzone-notifications.test.ts`: silent construction and subscription, synchronous changes, no-op suppression, opaque File identities, independent snapshot arrays, callback isolation, and reentrant delivery.
- `dropzone-previews.test.ts`: image/video/audio thumbnails, playable video URLs, caching, last-reference ownership, stale decodes, controlled video timeouts, and supported or malformed ID3 artwork.
- `dropzone-lifecycle.test.ts`: exact listener cleanup, inert late handlers and public mutations, destruction inside callbacks, late collection completion, pending media cancellation, and independent instances.

Run these suites from `packages/js` with Node 22.18 or newer:

```sh
node --test ui-interactions/tests/dropzone-*.test.ts
```

They also run under `npm run test:ui-interactions`. To inspect executed engine lines, branches, and functions:

```sh
node --test --experimental-test-coverage --test-coverage-include='**/src/dropzone.ts' ui-interactions/tests/dropzone-*.test.ts
```

Construction, subscription, and state reads do not emit an initial change. Successful state changes notify synchronously; unchanged operations stay silent. A distinct File replacement notifies even when its name and size match. Each state reader and subscriber owns a separate files array, retaining the original File references. Disabling blocks drag acquisition and picker opening while programmatic collection mutations remain available. Destruction preserves readable files and disabled state, clears dragging silently, suppresses later callbacks, and releases owned preview URLs. Duplicate references admitted with `dedupe: false` keep their cached previews until the last held reference leaves.

The fixture supplies controlled DOM listeners, directory batches, file inputs, media events, and canvas callbacks. It tracks object URL ownership and advances the video timeout with mock timers; it does not decode real video, render pixels, open a native picker, model event bubbling, or prove browser/cross-browser behavior. Audio fixtures use small binary ID3v2.3/v2.4 APIC frames with JPEG/PNG signatures. They protect the existing limited artwork parser and rejection of unsupported tag variations; they do not establish support for other metadata formats or validate full image decoding. Cost checks reject File/state serialization rather than using elapsed-time thresholds.

## Virtualize regression contract

The virtualize suites exercise the existing public API through supplied grid geometry, scroll events, resize observations and animation frames:

- `virtualize-config.test.ts`: option validation, defaults, initial delivery, strategy threshold boundaries and subscriber validation.
- `virtualize-geometry.test.ts`: resolved equal tracks, list fallback, cached first-cell aspect, raw positioning precision, gaps, row/column hit testing, empty and partial rows, overscan, padding and total height.
- `virtualize-scrolling.test.ts`: initial scroll position, scroll controls and browser clamping, bounded windows, burst coalescing, resize timing, separate scrollers and scrolling from subscribers.
- `virtualize-notifications.test.ts`: rounded no-op suppression, changing key mappings, serialization avoidance, callback isolation, provider failures, independent snapshots, duplicate subscriptions and reentrant delivery.
- `virtualize-lifecycle.test.ts`: exact resource cleanup, pending-frame cancellation, inert late callbacks, failed construction, destruction during providers or delivery, and independent instances/documents.

Run these suites from `packages/js` with Node 22.18 or newer:

```sh
node --test ui-interactions/tests/virtualize-*.test.ts
```

They also run under `npm run test:ui-interactions`. To inspect executed engine lines, branches and functions:

```sh
node --test --experimental-test-coverage --test-coverage-include='**/src/virtualize.ts' ui-interactions/tests/virtualize-*.test.ts
```

Construction delivers one synchronous initial state; later subscriptions are silent until a change. Resize delivery is synchronous, while scroll events coalesce into one animation frame. Notification comparisons use published geometry and current visible key identities; public reads remain fresh. Every reader owns its item array, item objects and styles, container style and optional range. Raw geometry remains available through positioning helpers even when rounded published state is unchanged.

The fixture supplies computed pixel tracks, cell rectangles, scroll offsets and viewport heights from the grid's own document. It tracks listener identity/options, resize observation and frame ownership; its scroll setter models browser upper-bound clamping. It does not perform browser layout or cross-browser integration testing. Existing geometry assumes uniform cells and a shared content origin when a separate scroller is supplied. Hit testing preserves the existing row/column buckets, including their following gaps and touching boundaries; it does not define strict cell-rectangle intersection. Virtual windows retain the existing inclusive trailing row plus configured overscan, and empty ranges use `{startIndex: 0, endIndex: -1}`. Cost checks reject serialization and count key-provider calls rather than using elapsed-time thresholds.

## Audio regression contract

The audio suites exercise the existing public API through a controlled media element and its owning document:

- `audio-config.test.ts`: default state, constructor and setter validation, media errors, formatting, unknown duration and live media.
- `audio-playback.test.ts`: source replacement and loading, reentrant rate choices, play/pause/stop/retry, seeks and previews, rate/volume/mute/loop controls, AB markers, autoplay success, rejection and competing attempts.
- `audio-settings.test.ts`: global preference restoration, explicit preference writes, corrupt or unavailable storage, progress throttling and forced saves, source-scoped restoration and live saved-time reads.
- `audio-keyboard.test.ts`: the published shortcut list, every existing key, configurable seek and volume steps, separate containers, modifiers and editable-target exclusions.
- `audio-media-session.test.ts`: metadata support and fallback, playback/position synchronization, each action handler, unavailable or throwing browser APIs and cleanup.
- `audio-pitch.test.ts`: capability gates, lazy graph creation, shared builds, pitch limits, CORS protection, failure fallback and retry, persisted pitch, suspended contexts and late worklet readiness.
- `audio-notifications.test.ts`: silent ordinary construction and subscription, configured/restored baselines, asynchronous initialization delivery, no-op/event-echo suppression, live media reads, independent nested snapshots, duplicate subscriptions, callback isolation and reentrant supersession.
- `audio-lifecycle.test.ts`: exact listener cleanup, retained native and Media Session handlers, inert public mutations, pending playback, destruction during delivery or source changes and independent instances.

Run these suites from `packages/js` with Node 22.18 or newer:

```sh
node --test ui-interactions/tests/audio-*.test.ts
```

They also run under `npm run test:ui-interactions`. To inspect executed engine lines, branches and functions:

```sh
node --test --experimental-test-coverage --test-coverage-include='**/src/audio.ts' ui-interactions/tests/audio-*.test.ts
```

Ordinary construction and subscription are silent. Silent configured and restored media settings become the notification baseline, so reverting them still notifies once. Configured source loading and autoplay retain their initialization deliveries when state changes. Later successful changes notify synchronously; async playback and restored pitch completion deliver after their promises settle. Source replacement preserves an explicit reentrant playback-rate choice, including the native reset rate. The engine marks its own primitive changes and observes browser-owned media values to suppress unchanged event echoes. The shared notifier isolates consumers and stops an obsolete outer delivery after a reentrant change or destruction. Every state reader and listener owns its source entries, buffered ranges, pitch state and progress state. Media Session synchronization precedes delivery. Persistence keeps its existing JSON formats; notification cost checks reject serialization only with persistence disabled.

Regressions cover late play rejection after teardown, stale autoplay rejection after disabling or replacing an attempt, teardown during autoplay notification before native playback, retained Media Session fast-seek handlers, progress restoration that changes only the restored flag, and continued work after destruction during AB rewinds or source loading. Pitch regressions cover replacing a failed build's direct audio route on successful retry, releasing a node that becomes ready after teardown, and preserving a newer build started synchronously by an error consumer.

The fixture supplies controlled media properties and events, source elements, local storage, Media Session handlers and the Web Audio/worklet message boundary. It models native load resets and records source connections, listener identities and resource cleanup. It does not decode audio, run a real AudioWorklet processor, prove pitch-shift sound quality, model browser autoplay policy or native event timing, or establish cross-browser playback behavior. Existing URL, source, settings and metadata formats are unchanged. Coverage percentages describe exercised code; the assertions establish the supported public behavior.

## Video regression contract

The video suites exercise the existing public API through a controlled media element and its owning document:

- `video-config.test.ts`: default state, constructor and setter validation, media errors, formatting, unknown duration and live media.
- `video-playback.test.ts`: loading and source replacement, playback and seek controls, rate/volume/mute/loop controls, AB markers, autoplay attempts and configured mute, poster clearing and reentrant rate choices.
- `video-settings.test.ts`: preference restoration and writes, corrupt or unavailable storage, progress throttling and forced saves, source-scoped restoration and live saved-time reads.
- `video-keyboard.test.ts`: the published keys, F fullscreen toggling, configurable steps, separate containers, modifiers and editable-target exclusions. P remains unassigned.
- `video-media-session.test.ts`: metadata support and fallback, playback/position synchronization, each action handler, unavailable or throwing browser APIs and cleanup.
- `video-captions.test.ts`: caption validation, owned track mounting and modes, selection, load/error events, persisted choices, source ordering, independent snapshots and track cleanup.
- `video-thumbnails.test.ts`: the existing VTT sprite format, URL resolution and scaling, preview fallback, fetch/HTTP/body failures, superseded responses and bodies, and teardown during pending loads.
- `video-presentation.test.ts`: standard and vendor fullscreen paths, picture-in-picture capabilities and ownership, native events, rejected promises and late completion.
- `video-gestures.test.ts`: mouse clicks, touch timing and zones, callback overrides and isolation, interactive exclusions, primary mouse buttons, disabling and timer cleanup.
- `video-notifications.test.ts`: silent ordinary construction and subscription, synchronous delivery, no-op/event-echo suppression, live media reads, independent nested snapshots, duplicate subscriptions and reentrant supersession.
- `video-lifecycle.test.ts`: exact listener cleanup, retained native and Media Session handlers, inert public mutations, pending playback, destruction during delivery or source changes and independent instances.

Run these suites from `packages/js` with Node 22.18 or newer:

```sh
node --test ui-interactions/tests/video-*.test.ts
```

They also run under `npm run test:ui-interactions`. To inspect executed engine lines, branches and functions:

```sh
node --test --experimental-test-coverage --test-coverage-include='**/src/video.ts' ui-interactions/tests/video-*.test.ts
```

Ordinary construction and subscription are silent. Configured source loading and autoplay retain their initialization deliveries when state changes. Successful synchronous changes notify immediately; asynchronous operations notify after completion when published state changes. Engine-owned primitive changes and observed DOM media values drive the shared notifier. It isolates consumers and stops obsolete outer delivery after reentrant changes or destruction. Every reader and listener owns its source entries, buffered ranges, caption state and tracks, and progress state. Media Session synchronization precedes delivery. Preference/progress JSON formats are preserved; notification cost checks reject serialization only with persistence disabled.

Thumbnail content remains available through preview helpers and does not add a VideoState field or force identical state deliveries. Tests preserve the limited `#xywh=x,y,width,height` payload format, the existing 10-by-10 sprite sizing, and the last-cue fallback. Autoplay mute is configured explicitly; a rejected attempt is retried only through the existing controls. A saved caption source resolves to current configured metadata, a stale source leaves captions off, and malformed storage cannot supply a new track.

The fixture supplies controlled media properties/events, source and track elements, local storage, Media Session handlers, fullscreen/PiP capabilities, deferred fetch responses/bodies and a deterministic gesture clock. It models native load resets and records listener identities, node ownership and timer cleanup. It does not decode video, fetch or parse captions in a browser, simulate native track selection, open fullscreen/PiP windows, model event bubbling or autoplay policy, or establish cross-browser media and gesture behavior. Coverage percentages describe executed code; assertions establish the existing public contracts and regressions.
