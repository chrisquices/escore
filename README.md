<br />
<div align="center">
    <img src="https://picsum.photos/seed/strata/200/200" alt="Strata placeholder logo" height="100">
</div>

<h1 align="center">Strata</h1>

<p align="center">
    Shared UI components, interaction engines, development tooling, and agent instructions for projects including Laravel applications and browser extensions.<br />
    <br />
    <br />
    <a href="https://laravel.com">
        <img height="32" src="https://img.shields.io/badge/Laravel-FF2D20?style=for-the-badge&logo=laravel&logoColor=white" alt="Laravel Badge" />
    </a>
    <a href="https://www.php.net/">
        <img height="32" src="https://img.shields.io/badge/PHP-777BB4?style=for-the-badge&logo=php&logoColor=white" alt="PHP Badge" />
    </a>
    <a href="https://vuejs.org/">
        <img height="32" src="https://img.shields.io/badge/Vue-4FC08D?style=for-the-badge&logo=vuedotjs&logoColor=white" alt="Vue Badge" />
    </a>
</p>

---

## Repository

Strata holds reusable code and conventions consumed by other applications. Select packages, tooling, and skills that match the project’s stack. Vue UI components and framework-independent interaction engines do not require Laravel; Inertia helpers require Inertia, and Laravel tooling and guides apply only to Laravel projects. See the [setup guide](skills/using-strata/references/setting-up-strata.md) for integration requirements and current package dependency constraints.

Each top-level folder has a separate purpose:

| Folder | What it contains and why it exists |
| --- | --- |
| [packages/](packages/) | Shared application code, so UI and interaction logic can be reused across projects. |
| [tooling/](tooling/) | Shared linting, formatting, and analysis rules, so consuming apps follow the same conventions. |
| [ide-integration/](ide-integration/) | Editor integrations that make working with Strata code more convenient. |
| [skills/](skills/) | Agent workflows and reference material for consistent work across projects. |
| [docs/](docs/) | Setup checklists and design notes that explain how the pieces fit together. |

---

## Packages

| Item | Purpose |
| --- | --- |
| [js/](packages/js/) | The `strata-packages` npm package, with shared dependencies, exports, and check commands. |
| [js/ui/](packages/js/ui/) | Vue components, theme styles, and supporting assets for building application interfaces. |
| [js/ui-interactions/](packages/js/ui-interactions/) | Framework-independent engines for media, dragging, selection, virtualization, and other interactions. |
| [js/inertia-plus/](packages/js/inertia-plus/) | Vue/Inertia helpers for forms, reactive state, loading behavior, and feedback. |
| [php/](packages/php/) | Reserved for shared PHP packages; currently empty. |
| [tsconfig.base.json](packages/tsconfig.base.json) | Common TypeScript compiler settings used by the JavaScript packages. |

Consuming apps link `strata-packages` from `file:../strata/packages/js` and compile its Vue/TypeScript source through their own build. See the [setup guide](skills/using-strata/references/setting-up-strata.md) for dependency and Vite configuration.

---

## Tooling

| Folder | Purpose |
| --- | --- |
| [eslint/](tooling/eslint/) | Current Vue/TypeScript lint configuration and custom rules for component structure and project conventions. |
| [eslint-old/](tooling/eslint-old/) | Previous ESLint implementation retained separately from the current rules. |
| [phpstan/](tooling/phpstan/) | PHP static analysis with Larastan and custom rules for Laravel application code. |
| [deptrac/](tooling/deptrac/) | Architecture checks that restrict dependencies between application layers. |
| [pint/](tooling/pint/) | Shared PHP formatting configuration. |
| [php-cs-fixer/](tooling/php-cs-fixer/) | Additional PHP formatting rules, including the custom comment-spacing fixer. |
| [rector/](tooling/rector/) | Shared Rector configuration scaffold; transformation rules are currently commented out. |

These configurations are used from consuming applications, where the corresponding tool dependencies are installed.

### Intentional ARIA policy

The blanket ban on authored `aria-*` attributes is an explicit repository-owner decision. The owner considers these attributes unwanted noise and prioritizes uncluttered templates. The rule is intentional, including its autofix behavior.

- Preserve `tooling/eslint/rules/general/all-must-not-have-aria-attributes.js` and its default enforcement.
- Do not add `aria-*` attributes to native elements or Vue components.
- Do not recommend removing, weakening, or adding exceptions to this rule during reviews, ratings, refactors, or unrelated fixes.
- Do not present this deliberate policy as an accidental defect or an outstanding cleanup task.
- Revisit this decision only when the user explicitly asks to change or discuss the ARIA policy.

---

## IDE Integration

| Folder | Purpose |
| --- | --- |
| [jetbrains/](ide-integration/jetbrains/) | PhpStorm/WebStorm plugin with code folding and a Strata tool window, keeping dense templates easier to navigate. |
| [vscode/](ide-integration/vscode/) | Reserved for a VS Code integration; currently empty. |

See the [JetBrains README](ide-integration/jetbrains/README.md) for building and installing the plugin.

---

## Agent Skills

| Folder | Purpose |
| --- | --- |
| [load-agent-protocol/](skills/load-agent-protocol/) | Shared working instructions for coding agents. |
| [using-strata/](skills/using-strata/) | Strata setup, tooling, shared UI and interactions, and conditional Vue/Inertia workflows. |
| [using-laravel/](skills/using-laravel/) | Laravel development workflows and supporting references. |
| [resolve-pending-items/](skills/resolve-pending-items/) | A workflow for working through pending items one at a time. |

---

## Documentation

| File | Purpose |
| --- | --- |
| [laravel-boost-guidelines.md](docs/laravel-boost-guidelines.md) | Shared Laravel conventions for agent and Boost context. |
| [laravel-new-post-install.md](docs/laravel-new-post-install.md) | Checklist for connecting a fresh Laravel app to Strata and its tooling. |
| [strata-ide-integration.md](docs/strata-ide-integration.md) | Feature and architecture conventions for the editor integrations. |

---

## Repository Files

| Item | Purpose |
| --- | --- |
| [README.md](README.md) | This map of the repository. |
| [.gitignore](.gitignore) | Keeps installed `node_modules/` directories out of version control. |
| `.git/` | Local Git history and repository metadata. |
| `.idea/` | JetBrains project settings used when opening the repository in the IDE. |

---

## Local Development

Install dependencies and run the package checks from `packages/js`. Use Node.js 22.18 or newer for the TypeScript test files.

```bash
cd packages/js
npm ci --ignore-scripts

npm run typecheck:ui
npm run typecheck:ui-interactions
npm run typecheck:inertia-plus

npm run test:ui-interactions
npm run test:inertia-plus
```

The packages export source directly, so application changes are built in the consuming app. Editor plugin development has its own [build instructions](ide-integration/jetbrains/README.md).
