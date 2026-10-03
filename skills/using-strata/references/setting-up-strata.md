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

"types:check": "vue-tsc --noEmit",

"quality:check": "npm run lint:check && npm run types:check",
"quality:fix": "npm run lint:fix && npm run quality:check"
```

Use `vue-tsc` for Vue projects; otherwise preserve the project’s existing type-check command, such as `tsc --noEmit` for TypeScript. Adapt lint coverage and generated-output ignores to the project’s source layout. The shared ESLint config includes Laravel-oriented ignores; these are not a required directory structure for other projects.

Define `quality:check` and `quality:fix` in `package.json` for every JavaScript/TypeScript project, including Laravel applications. `quality:check` aggregates all configured package checks: linting, type checking, tests, and any other verification scripts. Add the project's existing test command and other checks to the example above when present. Do not include development servers or watchers.

`quality:fix` runs all configured package automatic fixers, then `quality:check` to report remaining issues. Type errors and failed tests generally require manual changes. If no automatic fixer is configured, use `"quality:fix": "npm run quality:check"` and document that it only verifies. Keep both aggregates within `package.json`; neither may invoke Composer scripts.

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
    "@architecture:check"
],
"quality:fix": [
    "@refactor",
    "@lint",
    "@quality:check"
]
```

Include existing Composer test scripts and any additional PHP checks in `quality:check` as applicable. Composer's quality scripts must invoke only Composer-managed scripts and tools; they must never invoke npm or other package-manager scripts. `quality:fix` applies the Composer automatic fixes, then runs the Composer checks.

### 4. Usage

Each individual command runs its specific tool. Each quality command runs the complete configured set for its own manifest. The examples stop at the first failed command and return a nonzero exit status.

- `npm run quality:check`: all checks defined in `package.json`.
- `npm run quality:fix`: package automatic fixes, followed by package checks.
- `composer quality:check`: all checks defined in `composer.json`.
- `composer quality:fix`: Composer automatic fixes, followed by Composer checks.

Laravel applications with both manifests define both pairs. Run both commands to check or fix the whole application; neither delegates to the other. Projects without Composer use only the package commands.

To check the whole Laravel application, run each command from its root:

```sh
composer quality:check
npm run quality:check
```

To apply its configured automatic fixes and verify the results:

```sh
composer quality:fix
npm run quality:fix
```
