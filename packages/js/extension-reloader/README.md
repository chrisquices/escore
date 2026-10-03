# Extension reloader

Run from a Manifest V3 Chrome extension project's root with Node 22.18+:

```sh
node ../strata/packages/js/extension-reloader/index.ts
```

For Esverse, run `npm run extension-reloader`. Load its `dist` directory through
Chrome's **Load unpacked** button once, or reload an existing installation once
after the first successful development build to activate the helper.

The command watches project files, runs `npm run build`, adds a development
WebSocket helper to the built background service worker, and tells the extension
to reload after successful builds. Saves during a build queue another build.
Build failures are logged without sending a reload. Stop with Ctrl+C.

```sh
node ../strata/packages/js/extension-reloader/index.ts \
  --build "npm run build" \
  --out-dir dist \
  --port 17373 \
  --watch ../strata/packages/js
```

`--watch` can be repeated to include source directories outside the project.
Dependency folders, editor metadata, symlinks, and the output directory are
excluded. Use different ports when developing multiple extensions at once.

The runtime implementation is one TypeScript file and uses the `ws` dependency
installed in `strata/packages/js`. It requires a built `manifest.json` declaring
`background.service_worker`. A restrictive extension CSP is adjusted in the
development output to allow the local connection. No source manifest is changed.

This performs full extension reloads, which reset in-memory state and may close
extension views. It does not provide Vue HMR or refresh webpages containing
content scripts. Build failures can leave incomplete files in the build output;
fix the error and the next successful build will reload the extension.

Before distributing an extension, stop the reloader and run its normal clean
production build (`npm run build` in Esverse) to remove the development helper.

From `strata/packages/js`, verify with:

```sh
npm run typecheck:extension-reloader
npm run test:extension-reloader
```
