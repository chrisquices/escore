# Laravel New Post-Install

The user creates the application under apps/ using Laravel’s installer and chooses all installer options themselves.

This guide applies after installation, when the user asks the agent to complete the remaining workspace setup.

Apply the dependencies, configurations, edits, and cleanup below to the existing application. Preserve the user’s installer choices. Do not create or recreate the application or run the Laravel installer.

Merge configuration examples into existing files, preserving other entries. Apply conditional sections only when the application uses the relevant technology.

## Package identity

Give the application a unique workspace package name in its `package.json`:

```json
{
  "name": "@workspace/example",
  "private": true
}
```

## Vue Quality Tools

For a Vue application, install the dependencies required by the shared ESLint configuration and TypeScript checks:

```sh
pnpm add --save-dev eslint @stylistic/eslint-plugin @vue/eslint-config-typescript eslint-import-resolver-typescript eslint-plugin-import eslint-plugin-vue typescript typescript-eslint vue-tsc
```

Point the application's package scripts at the shared configurations:

```json
{
  "scripts": {
    "lint:check": "eslint --config ../../tooling/eslint/eslint.config.js .",
    "lint:fix": "eslint --config ../../tooling/eslint/eslint.config.js . --fix",
    "types:check": "vue-tsc --noEmit",
    "quality:check": "pnpm run lint:check && pnpm run types:check"
  }
}
```

## PHP quality tools

Install the tools in the application:

```sh
composer require --dev deptrac/deptrac larastan/larastan laravel/pint rector/rector
```

Point the application's Composer scripts at the shared configurations:

```json
{
  "scripts": {
    "lint": [
      "pint --config=../../tooling/pint/pint.json --parallel"
    ],
    "lint:check": [
      "pint --config=../../tooling/pint/pint.json --parallel --test"
    ],
    "architecture:check": [
      "deptrac analyse --config-file=../../tooling/deptrac/deptrac.php"
    ],
    "refactor:check": [
      "rector process --config=../../tooling/rector/rector.php --dry-run"
    ],
    "types:check": [
      "phpstan analyse --configuration=../../tooling/phpstan/phpstan.neon"
    ]
  }
}
```

## TypeScript Config

The application's `tsconfig.json` can inherit the workspace defaults while retaining its app-specific paths and included files:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "paths": {
      "@/*": ["./resources/js/*"]
    },
    "types": ["vite/client"]
  },
  "include": [
    "resources/js/**/*.ts",
    "resources/js/**/*.d.ts",
    "resources/js/**/*.tsx",
    "resources/js/**/*.vue"
  ]
}
```

## Workspace Packages

Add only the workspace packages the application uses:

```json
{
  "dependencies": {
    "@workspace/date": "workspace:*",
    "@workspace/ui": "workspace:*",
    "@workspace/inertia-plus": "workspace:*"
  }
}
```

Run `pnpm install` from the workspace root after adding the application or changing workspace dependencies.

## App-local files

Keep these files inside each Laravel application:

- `.env` and `.env.example`
- `composer.json` and `composer.lock`
- `package.json`
- `phpunit.xml`
- `tsconfig.json`
- `vite.config.ts`
- Laravel Boost and agent MCP configuration generated for that application

## Laravel Boost

If the application uses Laravel Boost, install it in the application, then generate `config/boost.php` by running this command from the application directory. Do not create the config file manually.

```sh
php artisan vendor:publish --tag=boost-config
```

Add the following `agents` entry to the array returned by `config/boost.php`:

```php
'agents' => [
    'codex' => [
        'guidelines_path' => base_path('../../docs/laravel-boost.md'),
    ],
    'claude_code' => [
        'guidelines_path' => base_path('../../docs/laravel-boost.md'),
    ],
    'cursor' => [
        'guidelines_path' => base_path('../../docs/laravel-boost.md'),
    ],
],
```

Then run:

```sh
php artisan boost:install
```

## Generated file cleanup

After creating the application and running any setup generators, delete these files from the application root if present:

- `AGENTS.md` and `CLAUDE.md` (including lowercase `agents.md` and `claude.md` variants)
- `.editorconfig`
- `.gitattributes`
- `.gitignore`
- `.npmrc`
- `.phpunit.result.cache`

New Laravel applications must not retain these files, even when they are automatically generated. Delete them again if a later setup or test command recreates them.
