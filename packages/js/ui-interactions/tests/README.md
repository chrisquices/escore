# Image regression contract

`image.js` is feature-complete. Future source changes should be limited to reproducible bug fixes, accompanied by regression coverage.

Run the complete image suite from this package directory with Node 22:

```sh
node --test tests/*.test.js
node --check src/image.js
pnpm typecheck
```

The TypeScript configuration lists `src/image.js` explicitly so its sibling declaration file cannot hide the implementation from strict checking.

The tests use Node's built-in runner and `@napi-rs/canvas` for real pixel processing. Canvas is test tooling only; the engine has no new runtime dependency.

Coverage includes document and layer mutations, modifier histories, global history and transactions, persistence and source resolution, rendering and preview proxies, crop/straighten/color sampling, coordinate conversion, notification cache invalidation, frame batching, and teardown.

Large-history checks verify frozen operation identity reuse, guard against copying old point arrays or serializing state during updates, and exercise local branching and global restoration. They use deterministic assertions rather than elapsed-time thresholds. Public `getState()` is checked separately for fresh, independent copies.

Browser event targets, resize observation, and frame scheduling are controlled by the fixture. Canvas pixels are produced by the native Canvas implementation; these tests do not replace browser UI or cross-browser integration tests. Small tolerances are used only for native alpha-compositing rounding.
