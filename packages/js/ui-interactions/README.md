# Headless Package Conventions

This document defines package integration and implementation rules for framework-independent controllers under `packages/ui-interactions`.

---

## File Location and Naming

`packages/ui-interactions/src/{controller-name}.js`

- Name engine folders in kebab-case.
- Name public engine entry files after the engine subject when the package contains multiple entry points.
- Keep engine-specific helpers inside the owning engine folder unless they are reusable across engines.
- Move reusable cross-engine helpers into a shared engine utility folder.

---

## Canonical Structure

Use this shared engine implementation shape:

1. Imports and shared constants.
2. Configuration defaults and validation.
3. Instance state.
4. Public engine API.
5. Engine lifecycle and event registration.
6. Feature-specific regions.
7. Private helpers.
8. Initialization.
9. Returned public handle.

---

## Responsibilities and Boundaries

- **Owns** — Shared engine package integration, engine-specific structure, lifecycle, validation, state contracts, consumer-facing engine contracts, and engine prefix vocabulary.
- **Delegates** — App-specific orchestration to the consuming app.
- **Must not contain** — App-specific UI behavior, duplicated shared code copied from consuming apps, JavaScript conventions owned by code guidelines, general conventions owned by code guidelines, or framework-specific application conventions.

---

## Atelier Package Integration

1. Treat `packages/ui-interactions` as the canonical source for shared, framework-independent controllers.
2. Import controllers through explicit `@escore/ui-interactions/*` package subpaths. Never use filesystem aliases or copy controllers into an app.
3. Make reusable controller changes directly in `packages/ui-interactions`.
4. Keep app-specific orchestration and UI outside `packages/ui-interactions`; move code into the package only when it is genuinely reusable behavior.
5. Before inspecting, creating, editing, or reviewing engine code, read and follow the complete implementation contract below.

---

## Comments

- Use comment regions to group engine sections.

---

## Functions and Closures

- Build an entire engine instance inside a single factory closure. Keep all per-instance state and every function reading it nested inside the factory closure.
- Keep only pure, stateless helpers at module scope.
- Do not use `this`, classes, or shared globals for engine instance state.
- Register every event listener inside one `registerAllEventListeners()` function.
- Group event listener registrations by domain with a standalone comment naming each group.
- Route every listener registration through the register-and-track helper.
- Keep option gates inside the individual handler.
- Call `registerAllEventListeners()` once from `init()`.

```js
function registerAllEventListeners() {

    // Playback Controls
    registerEventListener(video, "progress", function () {
        notify();
    });

    // Keyboard Shortcuts
    registerEventListener(playerContainer, "keydown", function (event) {
        handleKeyboardShortcut(event);
    });
}
```

---

## Structure and Layout

- Group related logic into cohesive, well-scoped domains, one per banner/region (each region is a domain). Keep all of a domain's logic together and scope it tightly. Don't expect strict top-to-bottom dependency/call order; functions reference each other both ways, and regions organize by domain, not by call sequence.
- Place a family of like things (state variables, getters, validation checks) in the one home that can hold 100% of them — never a partial split where the majority scatters to domains and a leftover subset falls back to a default bucket; if even one member is domainless, the whole family shares the default bucket until every member has a home. This is a passive rule: follow it silently when writing new code and don't narrate or police it; the user drives reorganization and does the moving themselves.
- Within a region, lead with its state declarations, then the behavior that mutates them, so the high-level orchestrator lands at the region's end. Order public methods before the private machinery, but place a data-shape factory immediately before its heaviest consumer, not up with the other helpers.
- After all regions are defined, wrap the whole boot sequence in one `init()` function — wire up subscribers/listeners, restore persisted preferences, apply config to the element, then start — and call it once at the tail. Close the factory with `init();` followed by a return object that's a flat handle of bare-name references only (no wrappers), doubling as the public API and a one-glance manifest of the surface.

  ```js
  return {
      open,
      close,
      reset,
      subscribe,
      destroy,
  };
  ```
- The consumer experience is plug-and-play: one `create*(element, config)` call is the entire integration — every capability is switched on through config, every reaction arrives through the config callbacks, and nothing else is asked of the consumer (no data attributes on markup, no required classes, no second setup call, no globals). The returned handle is equally curated: a method earns its export only if a consumer would realistically call it — capability alone is not a reason to expose it, and every export should be exercisable by a real UI.
- Open the config region by destructuring all config values with inline defaults, then one validate call immediately.

  ```js
  const {size = 16, label = "", strict = false} = config; // all config values destructured, with inline defaults
  validateConfig(); // one validate call, immediately; everything below trusts the values
  ```
- Stay narrow: do not refactor, abstract, or fragment speculatively or on reflex; do it only when you have genuinely reasoned it through. The user drives most refactoring; your role is the initial, foundational structure, not ongoing refactors. When unsure, leave the code as-is and surface the option rather than reshaping it yourself.
- Apply DRY only when the same logic recurs across different AREAS of the code; do not extract a tight run of co-located verbatim sibling lines just to save lines, and do not flag co-located repetition as a DRY defect.

---

## Validation and Contracts

- State is the single render source: `getState()` returns the full snapshot a consumer renders from, and `onChange` only signals that it changed — never carries data a consumer must store to avoid losing. Every persistent condition lives as a state field on the feature it belongs to; only instant occurrences go through fire-and-forget callbacks. A state field earns its place by saving the consumer real code — "technically derivable from other fields" is not grounds for cutting a convenience field; only genuine uselessness or true duplication is.
- `notify()` fires subscribers only when the state snapshot actually changed: dedupe against the last emitted snapshot (a serialized fingerprint is enough) before calling anyone, so media-event echoes and no-op mutations cost nothing. This is a consumer-facing guarantee, not an optimization — it lets a consumer treat every `onChange` as "something is different, re-render" without diffing on their side.
- Config given at creation defines what the instance *is* — its content, identity, and metadata. Don't offer runtime setters that swap that identity in place (new sources, new item list, new id): they silently strand every sibling feature derived from the old identity, and completing the swap honestly means re-running most of creation anyway. Changing content means destroy-and-recreate — the one supported path, and what any reactive frontend does naturally. Runtime setters exist only for behavior the user changes mid-session (volume, toggles, selection among the configured items).
- Validate all configuration at the boundary, once, and fail loud: throw a clear, prefixed error at creation time rather than silently no-opping or crashing later.

  ```js
  throw new TypeError("createWidget: the 'size' option must be a positive number.");
  ```
- Fail loud on malformed config shape/type, but do not babysit valid-but-contradictory developer misconfiguration. Give a contract; the dev obeys, and the contradictory result is correct. Require the documented input format; do not silently normalize a malformed value for the developer; they do the extra work.
- Validate a constructor's primary argument with a duck-typed capability check (e.g. `typeof x.someMethod === "function"`), not `instanceof`, so it works across realms/iframes.

  ```js
  if (typeof element.addEventListener !== "function") {
      throw new TypeError("createWidget: 'element' must be a DOM element.");
  }

  // not:  if (!(element instanceof HTMLElement))  // breaks for an element from another document/iframe
  ```
- Use `typeof x !== "boolean"` for options WITH a destructure default; `x !== undefined && <malformed>` for options with NO default; the presence guard encodes defaultedness. Match the numeric predicate to the quantity: `Number.isInteger` for a count, `Number.isFinite` for sizes; word the error to match.
- Validate cross-field consistency only after each field has individually passed, stating the relationship plainly.
- Downstream, trust exactly what the boundary validated: branch with the cheapest bare check (the raw boolean for a flag, a truthy guard for an optional limit, since validation already forbade 0), and don't re-check `!== undefined` or re-establish what validation already guaranteed; a guard for something the boundary did not cover is still legitimate.
- Use early-return guards at the top for not-applicable / already-in-state / nothing-to-do cases, so the body runs unindented on the real path.
- Return a defensive copy of any owned collection crossing the boundary, never the live array.

  ```js
  function items() {
      return owned.slice(); // a copy: callers can't mutate the live collection
  }
  ```
- Surface every runtime error as a fire-and-forget notification through the shared `createErrorReporter` factory: the instance's `reportError(id, text, metadata)` fires `{id, message, metadata}` at the consumer's `onError` and the engine stores nothing — keeping, toasting, or ignoring an error is entirely the consumer's job. The `id` is a stable kebab-case key the developer matches on (branching/i18n); the `message` is a polished, properly-written user-facing sentence (real users read it, so not amateur-sounding); `metadata` carries sub-lib-specific payloads (null when there are none). One shared factory across all sub-libs so the shape can't drift.

  ```js
  const reportError = createErrorReporter(onError); // one per instance, created from the shared factory
  reportError("network-error", "The video could not be loaded because of a network error.");
  ```
- Anything read back from storage (localStorage, a persisted snapshot, a saved preference) is untrusted input, not validated config: it may be stale, written by another instance with different content, or hand-edited. Restoring it must degrade silently — a stale reference simply matches nothing and nothing happens; never throw on it, never let it override what the current config makes impossible, and never re-save it blindly. Validate-once-trust-forever applies to what came through the boundary this session; storage is always from outside the boundary.
- Distinguish a value-check failure (an `if`-return on a `null` return) from a throwing-op failure (`try/catch`), coding each to its mechanism but routing both to the same neutral fallback.

  ```js
  const context = canvas.getContext("2d");
  if (!context) {
      return fallback(); // value-check: getContext returns null, never throws
  }

  try {
      context.drawImage(video, 0, 0); // throwing op: drawImage can throw, so try/catch
  } catch {
      return fallback();
  }
  ```

---

## Resource and Async Lifecycle

- Funnel every consumer-supplied callback through a try/catch isolation wrapper; never call one directly: a throwing subscriber must not abort an in-progress update or starve other subscribers, and the error surfaces to the console.

  ```js
  function callConsumer(callback, argument) {
      try {
          callback(argument);
      } catch (error) {
          console.error("createWidget: a consumer callback threw:", error);
      }
  }
  ```
- Set one `destroyed` flag and guard every state-mutating/async re-entry point so it returns a neutral value (matching the function's empty-but-valid contract) when destroyed. Place the guard ABOVE any memoization-cache hit so a torn-down instance never returns a stale cached resource.
- Never rely on `destroy()` having run: on a hard reload or navigation the consumer's framework teardown never fires, listeners stay attached through document unload, and the browser may fire events (a final `pause`, `abort`, `visibilitychange`) against an element it has already emptied. Any handler that persists data must therefore refuse a meaningless snapshot — guard on the fields that make the write worth keeping (a missing source, a zero duration, an empty payload) rather than trusting that teardown ordering protected it.
- Never attach a listener with a bare `addEventListener`; route every one through a register-and-track helper that attaches and pushes a matching detach closure in the same breath, so you can't add one without recording how to remove it.
- Create every node via the host document the instance was given (never a global), and scope document/window listeners to that same document/window, so the code works inside iframes and across realms.

---

## Audio Video Parity

- Keep `audio.js` and `video.js` in sync. They are deliberate near-clones over the same `HTMLMediaElement` core, with most regions differing only in the element they drive.
- When a change touches one file, inspect the matching region in the paired file and apply the same change when the code matches.
- If the change does not carry over, state why.
- Treat drift between these two files as a defect.

---

## Misc

- When the browser already has a mechanism for the job, hand the job to the browser instead of rebuilding it in JS: native fallback and selection beats a hand-rolled picker, a missing property falling back to the platform's own default beats filling the default yourself, and state the platform already persists beats a shadow copy of it. The native path is tested against every edge case you haven't thought of; a JS reimplementation is a second source of truth that can only drift.
- Use object-literal shorthand for closed-over names in a public handle or config, but explicit `key: value` in internal data-shape factories; the redundancy marks "this is the contract" vs "just plumbing". Destructure a just-returned result with shorthand at the call site even though the producer returned it longhand.

---

## Allowed Prefixes and Verbs

Every function name must begin with one of the prefixes below, or be one of the listed whole-word verbs. **If you are about to create a function whose leading word is not in these tables, stop everything and report to the user** so the name (or a new prefix) can be decided together; never invent a new prefix unilaterally.

| Prefix | Meaning | Examples |
|---|---|---|
| `add` | insert item(s) into an owned collection | `addFiles` |
| `apply` | impose config/state onto the live element or browser | `applyLoop`, `applyPoster`, `applySources`, `applyCaptions`, `applyMediaSession`, `applyPersistedSettings` |
| `call` | invoke a consumer-supplied callback | `callConsumer` |
| `clamp` | constrain a number into a valid range | `clampSeekTime` |
| `clear` | wipe a whole value/collection back to nothing | `clearAbLoop`, `clearPoster`, `clearMediaSessionState`, `clearPersistedSettings`, `clearFiles` |
| `collect` | gather items from a source into a collection (async/recursive work, not a cheap read) | `collectDroppedFiles`, `collectFilesFromFileSystemEntry` |
| `create` | mint a new instance, closure, or resource (a thumbnail image, an object URL) — may memoize and reuse | `createVideo`, `createErrorReporter`, `createThumbnail`, `createVideoThumbnail` |
| `decrease` | step a numeric value down | `decreaseVolume`, `decreasePlaybackRate` |
| `deselect` | remove one item from the selection set (idempotent; the inverse of `select`, distinct from `toggle`'s flip and `clear`'s wipe) | `deselect` |
| `disable` | turn a feature off | `disableComments` |
| `enable` | turn a feature on | `enableComments` |
| `enter` | move into a browser-managed mode (pairs with `exit`) | `enterFullscreen`, `enterPictureInPicture` |
| `exit` | leave a browser-managed mode (pairs with `enter`) | `exitFullscreen`, `exitPictureInPicture` |
| `find` | search a collection for a match | `findNextVttPayloadLine` |
| `format` | turn a raw value into display text | `formatTime`, `formatVolume` |
| `get` | trivial synchronous read returning a value | `getVolume`, `getState`, `getCaptionsState` |
| `handle` | react to a user-input event | `handleKeyboardShortcut`, `handleTouchGesture` |
| `has` | yes/no question, possession/completion flavor | `hasEnded` |
| `hide` | make a UI element not visible | `hideComments` |
| `increase` | step a numeric value up | `increaseVolume`, `increasePlaybackRate` |
| `is` | yes/no question about current state/support | `isPlaying`, `isLive`, `isMuted`, `isFullscreenSupported` |
| `list` | return an array of items | `listKeyboardShortcuts` |
| `load` | (re)run the media/resource loading cycle | `load`, `loadPreviewThumbnails` |
| `open` | open a browser-managed UI surface | `openFilePicker` |
| `parse` | coerce raw input into a validated internal value | `parseVolume`, `parseSeekTime`, `parseVttTime` |
| `read` | pull a batch/chunk from a streaming source (mirrors the native `read*` APIs) | `readNextDirectoryBatch` |
| `register` | attach a listener and record its teardown | `registerEventListener`, `registerAllEventListeners` |
| `remove` | take one item out of an owned collection (distinct from `clear`, which empties the whole thing) | `removeFile` |
| `replace` | swap one held item for another in place | `replaceFile` |
| `report` | fire an error/notification at the consumer | `reportError`, `reportMediaError` |
| `reset` | return a value to its default | `resetPlaybackRate` |
| `revoke` | release a minted browser resource (mirrors `URL.revokeObjectURL`) | `revokeThumbnail`, `revokeAllThumbnails` |
| `resolve` | derive a concrete value from a reference | `resolvePreviewThumbnailUrl` |
| `resume` | continue from a previously saved point | `resumeWatchProgress` |
| `rotate` | turn the view by an angle (pairs with a direction/target) | `rotateClockwise`, `rotateCounterClockwise` |
| `save` | persist state to storage | `savePersistedSettings`, `saveWatchProgress` |
| `scroll` | move the scroll position to an item or offset | `scrollToIndex`, `scrollToOffset` |
| `seek` | move the playback position | `seek`, `seekForward`, `seekBackward`, `seekToPercent` |
| `select` | resolve a click/gesture into the selection set, or add to it (a range, or all) | `select`, `selectRange`, `selectAll` |
| `set` | public setter mutating one piece of state | `setVolume`, `setCaption`, `setLoop` |
| `settle` | complete an async operation exactly once (resolve/reject + teardown), guarded against re-entry | `settleWith` |
| `should` | internal yes/no policy decision | `shouldIgnoreKeyboardShortcut`, `shouldIgnoreTouchGesture` |
| `show` | make a UI element visible | `showComments` |
| `start` | kick off a process that runs on its own | `startAutoplay` |
| `sync` | reconcile the element/browser with internal state | `syncAbLoop`, `syncCaptionTracks`, `syncMediaSessionState` |
| `toggle` | flip a binary state between its two modes | `togglePlayback`, `toggleFullscreen` |
| `validate` | check input against the contract — throws at the config boundary (programmer error), or returns verdicts for expected runtime data | `validateConfig`, `validateFiles` |
| `zoom` | change the zoom level of the view | `zoomIn`, `zoomOut`, `zoomToPoint` |

| Whole-word verb | Meaning |
|---|---|
| `play` | start playback |
| `pause` | halt playback in place |
| `stop` | halt playback and rewind to the start |
| `retry` | reload and attempt playback again |
| `destroy` | tear the whole instance down |
| `init` | run the boot sequence |
| `notify` | emit state to all subscribers |
| `subscribe` | add a change subscriber |
| `unsubscribe` | remove a change subscriber |

---

## Complete Example

None.

---

## Reference Implementation

None.
