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
