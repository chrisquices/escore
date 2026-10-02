# Setting Up Strata

Install all dependencies and complete every setup section in this guide.

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

This shares Vue and Inertia instances with the app and allows access to Strata's source.

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

No TypeScript aliases are needed with bundler module resolution.

---

## Strata Tooling

### 1. Install Dependencies

```sh
npm install --save-dev eslint @stylistic/eslint-plugin @vue/eslint-config-typescript eslint-import-resolver-typescript eslint-plugin-import-x eslint-plugin-vue typescript typescript-eslint vue-tsc

composer require --dev deptrac/deptrac phpstan/phpstan larastan/larastan laravel/pint friendsofphp/php-cs-fixer rector/rector pestphp/pest-plugin-phpstan nesbot/carbon
```

---

### 2. Add to `package.json` under the `scripts` section:

```json
"lint:check": "eslint --config ../strata/tooling/eslint/eslint.config.js .",
"lint:fix": "eslint --config ../strata/tooling/eslint/eslint.config.js . --fix",

"types:check": "vue-tsc --noEmit"
```

### 3. Add to `composer.json` under the `scripts` section:

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

`composer quality:check` runs all checks.

`composer quality:fix` runs all supported automatic fixes.

Run an individual command for a specific tool, or a quality command for the complete set.

To check violations:

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
