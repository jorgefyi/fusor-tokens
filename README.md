# Fusor Tokens

Fusor Tokens is a small CLI that turns [DTCG](https://www.designtokens.org/) design tokens into `public/tokens.css` and wires that file into a Fusor app’s `[package.metadata.fusor] assets-build`, so light and dark themes ship with `fusor build` and `fusor dev`.

The output is CSS variables prefixed `--ft-`. There is no component kit and no Tailwind theme.

## Install

```bash
npm install --save-dev fusor-tokens @terrazzo/cli @terrazzo/plugin-css
```

In this repo the package is the project itself:

```bash
npm install
node bin/fusor-tokens.js --help
```

Node 20 or newer is required. Rust apps stay Node-free until they opt in with `init`.

## Use

From a Fusor app root:

```bash
npx fusor-tokens init
```

`init` writes:

- `fusor-tokens.config.json`
- a starter `tokens/` DTCG set (primitives, semantic aliases, light and dark)
- `.fusor-tokens/terrazzo.config.ts` (committed; Terrazzo is the engine)
- `public/`
- npm devDependencies for Terrazzo
- `[package.metadata.fusor]` keys `assets = "public"` and `assets-build = ["npx fusor-tokens build"]` when they are missing

It does **not** call `fusor add`. Add the stylesheet in `<head>`:

```html
<link rel="stylesheet" href="/tokens.css" />
```

Edit a color, then rebuild:

```bash
# tokens/color.tokens.json — color.accent.9
npx fusor-tokens build
```

`build` validates the config, runs Terrazzo, and writes `public/tokens.css`. It is safe to run twice. `check` validates DTCG, asserts every semantic color resolves, and asserts the CSS would be non-empty without writing `public/tokens.css`.

```bash
npx fusor-tokens check
```

Commit `public/tokens.css` so a Fusor build without Node still has the last stylesheet. `assets-build` refreshes it when Node is available.

## Fusor wiring

```toml
[package.metadata.fusor]
entry = "web/index.html"
assets = "public"
assets-build = ["npx fusor-tokens build"]
output = "dist"
base-path = "/"
```

`assets-build` is the kebab-case form of fusor-build’s `assets_build` list. Each string runs as a shell program before Fusor copies `assets` into the build output.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script>
      (function () {
        try {
          var t = localStorage.getItem("theme");
          if (t === "dark" || t === "light")
            document.documentElement.setAttribute("data-theme", t);
          if (t === "dark") document.documentElement.classList.add("dark");
        } catch (e) {}
      })();
    </script>
    <link rel="stylesheet" href="/tokens.css" />
    <link rel="stylesheet" href="/app.css" />
    <title>My Fusor App</title>
  </head>
  <body>
    <app></app>
  </body>
</html>
```

Leave `data-theme` unset until the reader picks a theme. `tokens.css` then follows `prefers-color-scheme: dark` on `:root:not([data-theme="light"])`. An explicit `data-theme="light"` stays light even when the OS is dark. When a theme is stored, put it on `<html>` and keep `.dark` in sync. Use Fusor `class:name` for component state, not for the theme switch. See `examples/counter-themed` for the Cargo metadata, the HTML links, a FOUC script, and a Rust toggle sketch.

`tokens/semantic.tokens.json` is the light theme. `tokens/themes/dark.tokens.json` overrides the semantic colors for dark. There is no second copy of the light file. Space, radius, and type stay on `:root`. Shadow offset and blur stay shared; the shadow color (`color.shadow.sm`, `md`, `lg`) changes per theme so the lift is still visible on a dark background.

`color.warning` is a fill and badge color. Text uses `color.warning.fg` (`--ft-color-warning-fg`): `warning.11` in light, `warning.9` in dark, because `warning.11` on the dark background is about 2.6:1. Light `color.fg.subtle` is about 3.5:1 against `color.bg`, so it is for captions and metadata, not body text. Body copy uses `color.fg` or `color.fg.muted`.

```css
body {
  margin: 0;
  background: var(--ft-color-bg);
  color: var(--ft-color-fg);
  font: var(--ft-font-weight-regular) var(--ft-font-size-2) / var(--ft-line-height-normal)
    var(--ft-font-family-sans);
}
```

## Config

`fusor-tokens.config.json` matches `schema.json`:

```json
{
  "$schema": "./node_modules/fusor-tokens/schema.json",
  "tokens": ["tokens/**/*.tokens.json"],
  "outFile": "public/tokens.css",
  "engine": "terrazzo",
  "themeAttribute": "data-theme",
  "themes": ["light", "dark"],
  "prefix": "ft"
}
```

Token ids become variables by replacing `.` with `-`: `color.bg` → `--ft-color-bg`, `line-height.normal` → `--ft-line-height-normal`. Group names are kebab-case, matching the CSS custom properties.

## Engine

Terrazzo (`@terrazzo/cli` and `@terrazzo/plugin-css`) is the default. `init` writes a DTCG 2025.10 resolver and a CSS plugin config with `input: { theme: "light" | "dark" }` permutations. The light context is empty: `semantic.tokens.json` in the foundation set is the light source of truth. The CLI then normalizes the stylesheet so aliases resolve to the authored `oklch()` values, the dark block only repeats variables that changed, and the same dark diff is repeated under `@media (prefers-color-scheme: dark)` for `:root:not([data-theme="light"])`.

Style Dictionary is a possible later engine (`usesDtcg`, two selectors or a custom format). Setting `"engine": "style-dictionary"` fails with a clear error in this MVP. A sketch:

```json
{
  "source": ["tokens/**/*.tokens.json"],
  "platforms": {
    "css": {
      "transformGroup": "css",
      "buildPath": "public/",
      "files": [
        {
          "destination": "tokens.css",
          "format": "css/variables",
          "options": { "selector": ":root" }
        }
      ]
    }
  }
}
```

## Try the example

```bash
npm install
npm test
npm run preview
```

[Shift counter](http://127.0.0.1:44731) serves `examples/counter-themed` and toggles `data-theme` against the committed `public/tokens.css`.

## Non-goals

No shadcn- or Radix-style components, no Tailwind or UnoCSS export, no multi-brand themes, no Figma sync, no Rust token runtime, and no crates.io Fusor capability. Tokens are files plus a pre-asset script. The surface is intentionally small for Fusor pre-1.0.
