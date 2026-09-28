# Setting Up Escore Tooling

For a Laravel project beside the `escore` folder.

Apply each tool's setup only when its required packages are installed in the project. 

If any are missing, warn the user and skip that tool, do not install packages or add its scripts/configuration.

---

## Pint

Formats PHP code using shared style rules.

Requires these packages installed in the project:

- `laravel/pint`

Update the `scripts` section in the project's `composer.json`:

```json
"lint": "pint --config=../escore/tooling/pint/pint.json",
"lint:check": "pint --test --config=../escore/tooling/pint/pint.json"
```

To check violations:

```sh
composer lint:check
```

To fix violations:

```sh
composer lint
```

---

## PHPStan

Finds PHP type errors and potential bugs without running the application.

Requires these packages installed in the project:

- `phpstan/phpstan`
- `larastan/larastan`
- `nesbot/carbon`

Update the `scripts` section in the project's `composer.json`:

```json
"types:check": "phpstan analyse --configuration=../escore/tooling/phpstan/phpstan.neon"
```

To check violations:

```sh
composer types:check
```

---

## Rector

Automatically refactors PHP code using shared transformation rules.

Requires these packages installed in the project:

- `rector/rector`

Update the `scripts` section in the project's `composer.json`:

```json
"refactor": "rector process --config=../escore/tooling/rector/rector.php",
"refactor:check": "rector process --dry-run --config=../escore/tooling/rector/rector.php"
```

To check violations:

```sh
composer refactor:check
```

To fix violations:

```sh
composer refactor
```

---

## Deptrac

Checks that dependencies between application layers follow the shared architecture rules.

Requires these packages installed in the project:

- `deptrac/deptrac`

Update the `scripts` section in the project's `composer.json`:

```json
"architecture:check": "deptrac analyse --config-file=../escore/tooling/deptrac/deptrac.php"
```

To check violations:

```sh
composer architecture:check
```

---

## ESLint

Checks JavaScript, TypeScript, and Vue code for issues and fixes supported violations.

Requires these packages installed in the project:

- `eslint`
- `typescript`
- `@stylistic/eslint-plugin`
- `@vue/eslint-config-typescript`
- `eslint-plugin-import-x`
- `eslint-plugin-vue`
- `eslint-import-resolver-typescript`

Update the `scripts` section in the project's `package.json`:

```json
"lint": "eslint . --fix --config=../escore/tooling/eslint/eslint.config.js",
"lint:check": "eslint . --config=../escore/tooling/eslint/eslint.config.js"
```

To check violations:

```sh
npm run lint:check
```

To fix violations:

```sh
npm run lint
```

---

## Quality

Runs the configured checks or fixes through one Composer command for ease of use.

`@script` calls a script in `composer.json`; `npm run script` calls one in `package.json`. Define the ESLint scripts above first, then include them below so the quality commands cover both PHP and JavaScript. Commands run in order and stop on failure.

Update the `scripts` section in the project's `composer.json`:

```json
"quality:check": [
    "@lint:check",
    "@types:check",
    "@refactor:check",
    "@architecture:check",
    "npm run lint:check"
],
"quality:fix": [
    "@refactor",
    "@lint",
    "npm run lint"
]
```

Include only scripts configured for installed tools. PHPStan and Deptrac have no automatic fixes.

To check violations:

```sh
composer quality:check
```

To fix violations:

```sh
composer quality:fix
```
