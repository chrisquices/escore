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
