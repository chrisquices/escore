---
name: using-strata
description: "Use when setting up Strata, working on Strata’s ESLint tooling, or using strata-packages UI components and interaction engines in applications or browser extensions. Also covers reactive state, forms, reloads, and toast feedback in projects using Vue and Inertia."
---

## Required Docs

- None

## Instructions

Read and apply only the files relevant to the current task in hand, do not read all of them.

Match guidance to the project’s actual dependencies and runtime. Strata usage does not imply Laravel or Inertia; use the project’s existing state, routing, and request patterns when Inertia is absent.

- If the current task involves setting up Strata (Strata Packages, Strata Tooling, or any other Strata-related flow):
    - Read and apply [Setting Up Strata](references/setting-up-strata.md) completely.

- If the current task involves adding, editing, refactoring, or reading Strata's ESLint tooling files (`tooling/eslint/`) to work on the tooling itself:
    - Read and apply [ESLint](references/tooling/eslint.md) completely.

- If the current task involves building or editing UI using Strata components:
    - Read and apply the relevant `<family>.js` under [Component Families](../../tooling/eslint/rules/components/) when present. This does not require loading the ESLint tooling reference or unrelated families.

- If the current task involves using or editing Strata’s framework-independent interaction engines:
    - Read and apply [UI Interactions](../../packages/js/ui-interactions/README.md).

- If the current task involves implementing reactive state, Inertia forms, reload actions, or toast feedback in a Vue/Inertia project using
  `strata-packages`:
    - Read and apply [Using Inertia Plus](references/packages/using-inertia-plus.md) completely.
