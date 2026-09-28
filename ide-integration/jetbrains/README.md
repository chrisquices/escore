# JetBrains

Static `class` values fold by default to `...`, without a count. Folding preserves the quotes and never changes the file. Short values that would not become shorter are left visible. Dynamic Vue `:class` bindings stay visible.

Nonempty quoted ARIA values also fold to `...`, keeping their attribute names visible. This covers `aria-*`, `:aria-*`, and `v-bind:aria-*`, including short values such as `"1"`.

Requires PhpStorm or WebStorm 2026.1 or newer, with the Vue plugin enabled for `.vue` files.

## Panel

Open **View → Tool Windows → Escore**. It starts as a small floating window; dock or resize it using the IDE's controls.

The home panel’s **HTML** buttons collapse or expand all elements, class lists, or ARIA values in the active editor.

Click the cog to open **Settings**. **Collapsible HTML Classes**, **Collapsible HTML Elements**, and **Collapsible HTML ARIA** apply immediately across open projects and are saved for this IDE. Enabling class or ARIA folding collapses all its matching values in open editors. Click **X** to return to the Escore page.

## Build

Use Java 25 (available in current JetBrains IDEs). From this folder:

```sh
export JAVA_HOME="$HOME/Applications/WebStorm.app/Contents/jbr/Contents/Home"
./gradlew buildPlugin -PlocalIdePath="$HOME/Applications/WebStorm.app"
```

Without `localIdePath`, Gradle downloads WebStorm 2026.1 as the development SDK.

## Install

In PhpStorm or WebStorm: **Settings → Plugins → gear → Install Plugin from Disk**. Select the ZIP in `build/distributions/` and restart if prompted.

Click the folded `...` to expand it. Click the small collapse icon inside the opening quote, before the value, to compact the class list or ARIA value again. The icon is an editor decoration; it never changes the source.

Hover a foldable HTML element’s opening row to reveal an expand/collapse icon in its left indentation. It toggles the IDE’s existing fold without moving code. Where indentation is too narrow, use the native gutter control.

Each feature lives in its own file: `CollapsibleHtmlClasses.java`, `CollapsibleHtmlAria.java`, and `CollapsibleHtmlElements.java`.

## Develop

```sh
./gradlew runIde -PlocalIdePath="$HOME/Applications/WebStorm.app"
```

This starts a separate sandbox IDE with the plugin installed.
