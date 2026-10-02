# Laravel New Post-Install

This guide applies after a brand new Laravel installation, when the user asks the agent to complete setup for a standalone application using a separate local Strata checkout.

Apply the setup below to the existing application. Preserve the user’s installer choices.

Do not create or recreate the application or run the Laravel installer.

## Strata Setup

Invoke the [using-strata](../skills/using-strata/SKILL.md) skill to complete the Strata setup in this application, installing all dependencies and configuring both packages and tooling.

## Laravel Boost

If Laravel Boost is not already installed, install it in the application:

```sh
composer require --dev laravel/boost
```

Keep MCP configuration and skills application-local.

Then run:

```sh
php artisan boost:install
```

After installation, delete the application-local file containing only generated Boost guidelines. If Boost added a `<laravel-boost-guidelines>` block to a file containing other instructions, remove only that block. Preserve all other documentation, skills, MCP configuration, and agent instructions.

Set `"guidelines": false` in the application's `boost.json`, preserving all other settings, so `boost:update` does not recreate the generated guidelines. For subsequent installations, use `php artisan boost:install --mcp --skills`.

Add this instruction to the application's instruction file for each selected agent, preserving existing instructions:

```md
Read and apply [Laravel Boost Guidelines](../strata/docs/laravel-boost-guidelines.md).
```

Adjust the reference relative to the instruction file and the actual Strata checkout location. Read and apply those shared guidelines during setup as well.

The Strata guidelines are permanently frozen. Never modify, regenerate, or replace them, or merge generated Boost guidelines into them. Always use the Strata guidelines instead of generated application guidelines.
