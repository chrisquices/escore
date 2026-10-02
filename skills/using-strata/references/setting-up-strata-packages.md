# Setting Up Strata Packages (`strata-packages`)

For a Vue + Tailwind Vite project beside the `strata` folder.

## 1. Package dependency

Add under `dependencies` in the project's `package.json`:

```json
"strata-packages": "file:../strata/packages/js"
```

From the project root, install Strata's dependencies and link the package:

```sh
npm --prefix ../strata/packages/js install --ignore-scripts
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
            fileURLToPath(new URL('../strata/packages/js', import.meta.url)),
        ],
    },
},
```

This shares Vue and Inertia instances with the app and allows access to Strata's source.

## 3. Styles

In the project's CSS entry point, replace `@import 'tailwindcss';` with:

```css
@import 'strata-packages/ui/theme.css';
```

## 4. Imports

Use package exports in components:

```ts
import { Button } from 'strata-packages/ui/button';
```

Exports and dependencies are managed in `strata/packages/js/package.json`. No TypeScript aliases are needed with bundler module resolution.
