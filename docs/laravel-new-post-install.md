# Laravel New Post-Install

This guide applies after a brand new Laravel installation, when the user asks the agent to complete setup for a standalone application using a separate local Strata checkout.

Apply the dependencies, configurations, and edits below to the existing application. Preserve the user’s installer choices.

Do not create or recreate the application or run the Laravel installer.

Merge configuration examples into existing files, preserving other entries. Apply conditional sections only when the application uses the relevant technology.

Examples assume this sibling layout:

```text
parent/
├── application/
└── strata/
    ├── tooling/
    └── packages/js/
```

Run commands from the application root. Paths such as `../strata/tooling/` refer to the separate Strata checkout; adjust them if it lives elsewhere. The `npm --prefix` command below explicitly targets Strata’s JavaScript package directory.

Examples use npm. If the application already uses another package manager, translate the commands and preserve its existing lockfile and package manager choice.

## Vue Icons

For a Vue application, install Lucide as an application dependency.

```sh
npm add @lucide/vue
```

## Vue Quality Tools

For a Vue application, install the dependencies required by the shared ESLint configuration and TypeScript checks:

```sh
npm install --save-dev eslint @stylistic/eslint-plugin @vue/eslint-config-typescript eslint-import-resolver-typescript eslint-plugin-import-x eslint-plugin-vue typescript typescript-eslint vue-tsc
```

Point the application's package scripts at the shared configurations:

```json
{
  "scripts": {
    "lint:check": "eslint --config ../strata/tooling/eslint/eslint.config.js .",
    "lint:fix": "eslint --config ../strata/tooling/eslint/eslint.config.js . --fix",
    "types:check": "vue-tsc --noEmit",
    "quality:check": "npm run lint:check && npm run types:check",
    "quality:fix": "npm run lint:fix"
  }
}
```

## PHP Quality Tools

Install the tools in the application:

```sh
composer require --dev deptrac/deptrac larastan/larastan laravel/pint friendsofphp/php-cs-fixer rector/rector
```

For applications using Pest, also install its PHPStan plugin so PHPStan can analyze Pest tests:

```sh
composer require --dev pestphp/pest-plugin-phpstan
```

The shared PHPStan configuration directly includes this extension, so it must be installed when using that configuration.

Point the application's Composer scripts at the shared configurations:

```json
{
  "scripts": {
    "lint": [
      "pint --config=../strata/tooling/pint/pint.json",
      "php-cs-fixer fix --config=../strata/tooling/php-cs-fixer/php-cs-fixer.php"
    ],
    "lint:check": [
      "pint --config=../strata/tooling/pint/pint.json --test",
      "php-cs-fixer fix --config=../strata/tooling/php-cs-fixer/php-cs-fixer.php --dry-run --diff"
    ],
    "architecture:check": [
      "deptrac analyse --config-file=../strata/tooling/deptrac/deptrac.php"
    ],
    "refactor": [
      "rector process --config=../strata/tooling/rector/rector.php"
    ],
    "refactor:check": [
      "rector process --config=../strata/tooling/rector/rector.php --dry-run"
    ],
    "types:check": [
      "phpstan analyse --configuration=../strata/tooling/phpstan/phpstan.neon"
    ],
    "quality:check": [
      "@lint:check",
      "@types:check",
      "@refactor:check",
      "@architecture:check",
      "npm run quality:check"
    ],
    "quality:fix": [
      "@refactor",
      "@lint",
      "npm run quality:fix"
    ]
  }
}
```

The Composer quality scripts use the npm quality scripts from the Vue section above. For applications without Vue, omit those npm entries. Run `composer quality:check` to check PHP and Vue code, or `composer quality:fix` to apply the supported fixes. Type and architecture checks do not have automatic fixes.

## Local Strata Packages

For applications using Strata’s Vue components or other JavaScript exports, add the local package to the application’s dependencies:

```json
{
  "dependencies": {
    "strata-packages": "file:../strata/packages/js"
  }
}
```

From the application root, install the external package’s dependencies and link its sources into the application:

```sh
npm --prefix ../strata/packages/js install --ignore-scripts
npm install --install-links=false --ignore-scripts
```

The first command installs dependencies inside Strata’s JavaScript package directory. The second links the local `file:` dependency so the application uses that checkout’s sources.

Follow [Setting Up Strata Packages](../skills/using-strata/references/setting-up-strata-packages.md) for the remaining Vite configuration, source access, dependency deduplication, and styles setup.

## Laravel Boost

If the application uses Laravel Boost and it is not already installed, install it in the application:

```sh
composer require --dev laravel/boost
```

Publish `config/boost.php` before running the installer. Do not create the config file manually:

```sh
php artisan vendor:publish --tag=boost-config
```

Preserve existing application-specific configuration unless a migration requires changes. In the published `config/boost.php`, add or merge these entries under `agents` so Boost writes agent guidelines to Strata’s shared guidelines file:

```php
'agents' => [
    'codex' => [
        'guidelines_path' => base_path('../strata/docs/laravel-boost-guidelines.md'),
    ],
    'claude_code' => [
        'guidelines_path' => base_path('../strata/docs/laravel-boost-guidelines.md'),
    ],
    'cursor' => [
        'guidelines_path' => base_path('../strata/docs/laravel-boost-guidelines.md'),
    ],
],
```

This path follows the sibling layout above; adjust it to the actual Strata checkout location. Keep MCP configuration and skills application-local.

Then run:

```sh
php artisan boost:install
```
