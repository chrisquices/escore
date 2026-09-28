# Setting Up Escore Packages (`escore-packages`)

For a Vue + Tailwind Vite project beside the `escore` folder.

## 1. Package dependency

Add under `dependencies` in the project's `package.json`:

```json
"escore-packages": "file:../escore/packages/js"
```

From the project root, install Escore's dependencies and link the package:

```sh
npm --prefix ../escore/packages/js install --ignore-scripts
npm install --install-links=false --ignore-scripts
```

## 2. Vite

Add to `vite.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
```

Merge into the existing `defineConfig` options, keeping other settings:

```ts
resolve: {
    dedupe: ['vue', '@inertiajs/vue3', '@inertiajs/core'],
},
server: {
    fs: {
        allow: [
            fileURLToPath(new URL('.', import.meta.url)),
            fileURLToPath(new URL('../escore/packages/js', import.meta.url)),
        ],
    },
},
```

This shares Vue and Inertia instances with the app and allows access to Escore's source.

## 3. Styles

In the project's CSS entry point, replace `@import 'tailwindcss';` with:

```css
@import 'escore-packages/ui/theme.css';
```

## 4. Imports

Use package exports in components:

```ts
import { Button } from 'escore-packages/ui/button';
```

Exports and dependencies are managed in `escore/packages/js/package.json`. No TypeScript aliases are needed with bundler module resolution.
