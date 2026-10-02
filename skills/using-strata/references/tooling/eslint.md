# ESLint

Shared tooling lives in `tooling/eslint`. Dependencies and quality commands belong to the consuming project; the config resolves dependencies from that project's working directory.

## Naming

Use kebab-case: **prefix → thing → subject → detail**, where applicable.

| Prefix | Use when | Example |
| --- | --- | --- |
| `require` | Something must exist or be used. | `require-attribute-input-type.js` |
| `enforce` | Something must follow a specific format, order, or structure. | `enforce-attribute-order-dialog.js` |
| `forbid` | Something must not be used or occur. | `forbid-one-liner-button.js` |

Keep the thing before the subject: `require-comment-alert.js`, `enforce-one-liner-dialog-description.js`. These are the only prefixes for new rules.

Prefixes describe intent. Severity (`warn`/`error`) and autofix support are separate decisions; none of these prefixes guarantees an autofix.

For component relationship rule IDs, use `require-<parent>-to-directly-have-<child>` for immediate children, or `to-have` for descendants at any depth. Keep each component name together, without internal hyphens.

## Structure

Paths below are relative to `tooling/eslint`.

| Path | Purpose |
| --- | --- |
| `eslint.config.js` | Entry point for loading, registering, and configuring shared ESLint tooling. Keep rule implementations out of it. |
| `helpers/` | Reusable logic shared by rule implementations. |
| `rules/general/` | Rules spanning multiple code contexts or governing a file as a whole. |
| `rules/script/` | Rules applying only inside Vue `<script>` and `<script setup>` sections. |
| `rules/packages/` | Rules governing the use of specific packages and their APIs. |
| `rules/components/<family>.js` | A component family's structure and independent Vue template rules in one file. |
| `rules/template/` | Rules applying only inside Vue `<template>` sections, grouped by concern. |
| `tests/` | Validation of rule behavior and autofix correctness. |

Within `rules/template/`:

| Folder | Purpose |
| --- | --- |
| `element-attributes/` | Attribute presence, values, and permitted usage. |
| `element-attributes-order/` | Ordering of attributes within an element's opening tag. |
| `element-attributes-layout/` | Layout and formatting of attributes within an opening tag. |
| `element-comments/` | Requirements and conventions for comments associated with elements. |
| `element-native/` | Rules governing the use of native HTML elements. |
| `element-one-liners/` | Whether an element and its content stay on one line or wrap across lines. |
| `element-placement/` | Structural placement and nesting of elements within a template. |
| `element-spacing/` | Whitespace and separation around elements. |
| `element-association/` | Required relationships and consistency between related elements. |
| `element-icons/` | Rules governing icons used within elements. |
| `element-event-handlers/` | Rules governing event handlers declared on template elements. |

### Component families

Each `rules/components/<family>.js` contains the family's structure definition and separately named rules. Keep required existence, allowed structure, and spacing independent; shared helpers implement the checks and fixes.

Component prop checks read the consuming project's TypeScript config from `settings.strata.componentTsconfig`.

## Before creating a rule

Discuss new rules with the user before implementing them. Present each proposal in exactly this format, replacing the example content with the proposed rule:

```markdown
**`forbid-native-button.js`**

- **Folder:** `tooling/eslint/rules/template/element-native/`
- **Behavior:** Flag every native `<button>` in Vue templates. Require the UI kit’s `<Button>`.
- **Prefix:** `forbid` because it bans an element.
- **Report-only:** Replacing it requires choosing appropriate component props and imports.

Violation message:

> Replace native `<button>` with the UI kit’s `<Button>`. Preserve its behavior, import Button if needed, and specify type, variant, and size.
```

Render the proposal as Markdown, without the surrounding code fence. Keep the labels and order; replace **Report-only:** with **Autofix:** when applicable, explaining what is safely fixed. Include recommendations, relevant exceptions, tradeoffs, helper reuse, and rule interactions within these bullets when useful. Keep it concise.

Implement after approval. Honor approval already given for the agreed behavior; do not ask for it again.

## Adding a rule

1. Keep rules atomic. Component-family rules share `rules/components/<family>.js`; otherwise create one file per rule. Keep attribute existence, order, and layout separate. Package rules stay flat inside `rules/packages/<package>/`, without script/template subfolders; shared helpers belong in `helpers/`.
2. Reuse the corresponding helper. Component-specific files supply targets and conditions; shared behavior belongs in the helper. All one-liner rules use the shared one-liner foundations.
3. Import and register rules in `eslint.config.js`, then enable `strata/<rule-id>` in the appropriate file scope. Use the filename stem as the ID for standalone rules; family files export a map of separate rule IDs. Creating or registering a file alone does not enable it.
4. Write an actionable violation message: identify what failed, the expected result, and how to repair it. Include actual/expected values when useful; descriptions alone are not enough.

## Rule boundaries and fixes

- Specify targets explicitly: `<Input>` and native `<input>` are separate targets. State whether static attributes, bindings (`:open`), or events (`@update:open`) satisfy the rule.
- Attribute presence does not imply a nonempty value. Add value validation only when required. Component rules should not absorb unrelated label/field responsibilities.
- Autofix only when the correction is unambiguous. Preserve values, expressions, rendered whitespace, and binding precedence. Otherwise report the repair needed.
- Use narrow source edits. Repeated fixes must produce no further changes, and overlapping rules must agree. For example, generic one-liner formatting must not undo a component's attribute layout.
- Do not invent labels, IDs, imports, or move component trees to satisfy structural rules; report those violations.
