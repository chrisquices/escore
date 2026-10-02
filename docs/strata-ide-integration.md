# Strata IDE Integration

## Structure

- `ide-integration/jetbrains/`: Java plugin for PhpStorm and WebStorm, using native JetBrains UI.
- `ide-integration/vscode/`: separate implementation; empty for now.

## Adding a Feature

- Keep each feature's logic in its own file, named after its setting: **Collapsible HTML Classes** → `CollapsibleHtmlClasses.java`.
- Add its checkbox to **Settings** and its actions to the home panel. Shared settings and panel files handle the wiring.
- Group HTML features under the **HTML** separator on both pages.
- Scope styling and editor behavior to that feature. Folding and editor decorations must never alter source files.

## Panel

- Use the native **Strata** tool window, with a small 2:3 portrait default and normal resizing/docking.
- Put the settings cog in the native header; replace it with **X** while Settings is open. Do not duplicate the header inside the panel.
- Arrange home actions in two columns: **Collapse** first, **Expand** second. Rows are elements, classes, then ARIA.

## Folding

- Collapsed class and ARIA values display `...`, without a count; names and quotes stay visible.
- ARIA matching covers `aria-*`, `:aria-*`, and `v-bind:aria-*`. Keep its implementation in `CollapsibleHtmlAria.java`.
- Place attribute collapse controls inside the opening quote, before the value, with roughly four characters of width.
- Derive placeholder colors from the editor's attribute-value color: 60% text opacity and 30% background opacity. Other folds must remain unaffected.
- Enabling either attribute-folding setting immediately collapses all its matching values. Classes and ARIA have independent settings and home actions.
- Show element controls to the left of the hovered row's foldable element, without shifting the code.

## Builds

- Keep version `0.1.0`; replace the existing distribution ZIP instead of accumulating versions.
- Update through **Install Plugin from Disk**, restarting the IDE when required.
