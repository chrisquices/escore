# Setting Up Strata Tooling

For a Laravel project beside the `strata` folder.

Apply each tool's setup only when its required packages are installed in the project.

If any are missing, warn the user and skip that tool, do not install packages or add its scripts/configuration.

---

## PHP Formatting

Requires these packages installed in the project:

- `laravel/pint`
- `friendsofphp/php-cs-fixer`

Update the `scripts` section in the project's `composer.json`:

```json
"lint": [
    "pint --config=../strata/tooling/pint/pint.json",
    "php-cs-fixer fix --config=../strata/tooling/php-cs-fixer/php-cs-fixer.php"
],
"lint:check": [
    "pint --test --config=../strata/tooling/pint/pint.json",
    "php-cs-fixer fix --config=../strata/tooling/php-cs-fixer/php-cs-fixer.php --dry-run --diff"
]
```

For an existing Pint setup missing PHP-CS-Fixer, retain the existing Pint commands and report the missing package. Once both packages are available, use the combined commands above.

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

Requires these packages installed in the project:

- `phpstan/phpstan`
- `larastan/larastan`
- `nesbot/carbon`

Update the `scripts` section in the project's `composer.json`:

```json
"types:check": "phpstan analyse --configuration=../strata/tooling/phpstan/phpstan.neon"
```

To check violations:

```sh
composer types:check
```

---

## Rector

Requires these packages installed in the project:

- `rector/rector`

Update the `scripts` section in the project's `composer.json`:

```json
"refactor": "rector process --config=../strata/tooling/rector/rector.php",
"refactor:check": "rector process --dry-run --config=../strata/tooling/rector/rector.php"
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

Requires these packages installed in the project:

- `deptrac/deptrac`

Update the `scripts` section in the project's `composer.json`:

```json
"architecture:check": "deptrac analyse --config-file=../strata/tooling/deptrac/deptrac.php"
```

To check violations:

```sh
composer architecture:check
```

---

## ESLint

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
"lint": "eslint . --fix --config=../strata/tooling/eslint/eslint.config.js",
"lint:check": "eslint . --config=../strata/tooling/eslint/eslint.config.js"
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

Define the ESLint scripts above before including them in the quality commands below.

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

Include only scripts configured for installed tools.

To check violations:

```sh
composer quality:check
```

To fix violations:

```sh
composer quality:fix
```
