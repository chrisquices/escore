# ESLint

Shared tooling lives in `tooling/eslint`. Dependencies and quality commands belong to the consuming project; the config resolves dependencies from that project's working directory.

The shared configuration targets Vue/TypeScript and does not require Laravel. Its current ignores include Laravel paths; consuming projects such as browser extensions must account for their own generated output and source layout. Keep extension-specific build configuration and type declarations in the consuming project.

## Naming

Use kebab-case rule IDs: `<subject>-must-<requirement>` or `<subject>-must-not-<prohibition>`.

Examples:

- `comment-must-have-blank-line-above`
- `all-must-not-have-aria-attributes`
- `button-must-have-valid-props`
- `button-must-follow-structure`

Standalone filenames match their rule IDs. Component-family files use the family name, such as `button.js`, and export separate rule IDs.

Component relationships belong to `<family>-must-follow-structure`.

Severity (`warn`/`error`) and autofix support are separate decisions.

## Structure

Paths below are relative to `tooling/eslint`.

| Path | Purpose |
| --- | --- |
| `eslint.config.js` | Entry point for loading, registering, and configuring shared ESLint tooling. Keep rule implementations out of it. |
| `helpers/` | Reusable logic shared by rule implementations. |
| `rules/general/` | Standalone rules that apply across component families or to the file as a whole. |
| `rules/components/<family>.js` | A component family's structure and independent Vue template rules in one file. |
| `tests/` | Validation of rule behavior and autofix correctness. |

### Component families

Each `rules/components/<family>.js` contains the family's structure definition and separately named rules. Required children, allowed children, nesting, and child order belong to the structure rule. Keep spacing checks separate; shared helpers implement the checks and fixes.

Component prop checks use Strata's `packages/js/ui/tsconfig.json` by default. Set `settings.strata.componentTsconfig` to override that path.

## Before creating a rule

Discuss new rules with the user before implementing them. Present each proposal in exactly this format, replacing the example content with the proposed rule:

```markdown
**`native-button-must-not-be-used.js`**

- **Folder:** `tooling/eslint/rules/general/`
- **Behavior:** Flag every native `<button>` in Vue templates. Require the UI kit’s `<Button>`.
- **Report-only:** Replacing it requires choosing appropriate component props and imports.

Violation message:

> Replace native `<button>` with the UI kit’s `<Button>`. Preserve its behavior, import Button if needed, and specify type, variant, and size.
```

Render the proposal as Markdown, without the surrounding code fence. Keep the labels and order; replace **Report-only:** with **Autofix:** when applicable, explaining what is safely fixed. Include recommendations, relevant exceptions, tradeoffs, helper reuse, and rule interactions within these bullets when useful. Keep it concise.

Implement after approval. Honor approval already given for the agreed behavior; do not ask for it again.

## Adding a rule

1. Keep rules atomic. Component-family rules share `rules/components/<family>.js`; otherwise create one file per rule in `rules/general/`. Keep attribute existence, order, and layout separate; shared helpers belong in `helpers/`.
2. Reuse the corresponding helper. Component-specific files supply targets and conditions; shared behavior belongs in the helper. Component layout checks use `helpers/component-layout.js`.
3. For standalone rules, import the rule into `eslint.config.js` and add it to `generalRules`, using its filename stem as the ID. All entries are automatically enabled. Component-family files in `rules/components/` are automatically loaded, and their exported rule IDs are automatically enabled for Vue files.
4. Write an actionable violation message: identify what failed, the expected result, and how to repair it. Include actual/expected values when useful; descriptions alone are not enough.

## Rule boundaries and fixes

- Specify targets explicitly: `<Input>` and native `<input>` are separate targets. State whether static attributes, bindings (`:open`), or events (`@update:open`) satisfy the rule.
- Attribute presence does not imply a nonempty value. Add value validation only when required. Component rules should not absorb unrelated label/field responsibilities.
- Autofix only when the correction is unambiguous. Preserve values, expressions, rendered whitespace, and binding precedence. Otherwise report the repair needed.
- Use narrow source edits. Repeated fixes must produce no further changes, and overlapping rules must agree. For example, generic one-liner formatting must not undo a component's attribute layout.
- Do not invent labels, IDs, imports, or move component trees to satisfy structural rules; report those violations.
