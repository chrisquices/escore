# Setting Up Strata

Complete the setup sections that apply to the project’s stack and requested Strata features. Projects may include Laravel applications, standalone frontends, and browser extensions.

- Use the package setup when consuming `strata-packages`. Vue components and theme setup apply when using Strata UI; interaction engines have their own [integration requirements](../../../packages/js/ui-interactions/README.md).
- Apply the Vite example only when the project uses Vite. Otherwise configure the existing bundler to compile the imported Strata source.
- Use JavaScript tooling for compatible frontend projects. The current shared ESLint configuration uses Vue/TypeScript tooling, even when the consuming project has no Laravel backend.
- Apply the Composer tooling below only to Laravel projects. Other PHP projects need configurations appropriate to their own structure and dependencies.

For browser extensions, preserve the existing manifest, entry points, and extension build configuration. Check the chosen exports against their target runtime; framework independence does not imply support in every extension context. Verify the resulting extension build in its intended browser context.

Merge configuration examples into existing files, preserving other entries.

Examples assume this sibling layout:

```text
parent/
├── application/
└── strata/
    ├── tooling/
    └── packages/js/
```

Run commands from the application root. Paths such as `../strata/tooling/` refer to the separate Strata checkout; adjust them if it lives elsewhere.

Examples use npm. If the application already uses another package manager, translate the commands and preserve its existing lockfile and package manager choice.

## Strata Packages (`strata-packages`, `/strata/packages`)

### 1. Install Dependencies

For Strata’s Vue UI:

```sh
npm add @lucide/vue
```

### 2. Add to `package.json` under the `dependencies` section:

Add under `dependencies` in the project's `package.json`:

```json
"strata-packages": "file:../strata/packages/js"
```

Afterwards, from the project's root (the project that's using `strata-packages`, not `strata` itself, ):

```sh
npm --prefix ../strata/packages/js install --ignore-scripts
npm install --install-links=false --ignore-scripts
```

--- 

### 3. Add to `vite.config.ts`

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

This shares Vue and Inertia instances with the app and allows access to Strata's source. Keep dedupe entries for the libraries the project uses; a Vue project without Inertia needs only `vue` here.

--- 

### 4. Add to `app.css` (or whatever your main CSS file is)

In the project's CSS entry point, replace:

```css
@import 'tailwindcss';
```

with:

```css
@import 'strata-packages/ui/theme.css';
```

---

### 5. Component usage

Use package exports in components, for example:

```ts
import { Button } from 'strata-packages/ui/button';
```

Exports and dependencies are managed in `strata/packages/js/package.json`.

The package currently declares Vue, Tailwind, Inertia, and Vue Sonner as required peers, including for consumers using only UI or interaction exports. Account for these installation requirements; importing a non-Inertia export does not make the package’s Inertia peer optional. Use `strata-packages/inertia-plus` only in an Inertia application. 

No TypeScript aliases are needed with bundler module resolution.

---

## Strata Tooling

### 1. Install Dependencies

For the shared Vue/TypeScript ESLint configuration:

```sh
npm install --save-dev eslint @stylistic/eslint-plugin @vue/eslint-config-typescript eslint-import-resolver-typescript eslint-plugin-import-x eslint-plugin-vue typescript typescript-eslint vue-tsc
```

For Laravel projects only:

```sh
composer require --dev deptrac/deptrac phpstan/phpstan larastan/larastan laravel/pint friendsofphp/php-cs-fixer rector/rector pestphp/pest-plugin-phpstan nesbot/carbon
```

---

### 2. Add to `package.json` under the `scripts` section:

```json
"lint:check": "eslint --config ../strata/tooling/eslint/eslint.config.js .",
"lint:fix": "eslint --config ../strata/tooling/eslint/eslint.config.js . --fix",

"types:check": "vue-tsc --noEmit"
```

Use `vue-tsc` for Vue projects; otherwise preserve the project’s existing type-check command, such as `tsc --noEmit` for TypeScript. Adapt lint coverage and generated-output ignores to the project’s source layout. The shared ESLint config includes Laravel-oriented ignores; these are not a required directory structure for other projects.

For projects without Composer, use the package-manager scripts directly. If aggregate quality scripts are needed, define them in `package.json` using the applicable existing checks and fixes.

### 3. Laravel only: add to `composer.json` under the `scripts` section:

```json
"architecture:check": "deptrac analyse --config-file=../strata/tooling/deptrac/deptrac.php",

"types:check": "phpstan analyse --configuration=../strata/tooling/phpstan/phpstan.neon",

"lint": [
    "pint --config=../strata/tooling/pint/pint.json",
    "php-cs-fixer fix --config=../strata/tooling/php-cs-fixer/php-cs-fixer.php"
],
"lint:check": [
    "pint --test --config=../strata/tooling/pint/pint.json",
    "php-cs-fixer fix --config=../strata/tooling/php-cs-fixer/php-cs-fixer.php --dry-run --diff"
],

"refactor": "rector process --config=../strata/tooling/rector/rector.php",
"refactor:check": "rector process --dry-run --config=../strata/tooling/rector/rector.php",

"quality:check": [
    "@lint:check",
    "@types:check",
    "@refactor:check",
    "@architecture:check",
    "npm run lint:check",
    "npm run types:check"
],
"quality:fix": [
    "@refactor",
    "@lint",
    "npm run lint:fix"
]
```

### 4. Usage

Each individual command runs its specific tool. 

For Laravel projects configured above, `composer quality:check` runs all checks.

For those projects, `composer quality:fix` runs all supported automatic fixes.

Run an individual command for a specific tool, or a quality command for the complete set.

Run only commands configured for the project. To check violations:

```sh
npm run lint:check
npm run types:check

composer lint:check
composer types:check
composer refactor:check
composer architecture:check

composer quality:check


```

To fix violations:

```sh
npm run lint:fix

composer lint
composer refactor

composer quality:fix

```
