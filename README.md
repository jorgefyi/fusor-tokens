# Tesso

[![npm](https://img.shields.io/npm/v/tesso-ui)](https://www.npmjs.com/package/tesso-ui)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Tesso is a small CLI that turns [DTCG](https://www.designtokens.org/) design tokens into `public/tokens.css` and copies accessible, token-based components into a [Fusor](https://github.com/fusor-rs/fusor) app. You own the files it writes. The npm package is `tesso-ui`. The binary is `tesso`.

The output is CSS variables prefixed `--tesso-`. Components style themselves only with those variables and work in light and dark.

## Quick start

```bash
npm install --save-dev tesso-ui @terrazzo/cli @terrazzo/plugin-css
npx tesso-ui init
npx tesso-ui add button
fusor dev
```

Then add the stylesheets to `<head>`:

```html
<link rel="stylesheet" href="/tokens.css" />
<link rel="stylesheet" href="/tesso.css" />
```

`npx tesso-ui` and `tesso` run the same binary.

## Install

```bash
npm install --save-dev tesso-ui @terrazzo/cli @terrazzo/plugin-css
```

Node 20 or newer is required. Rust apps stay Node-free until they opt in with `init`.

## Use

From a Fusor app root:

```bash
npx tesso-ui init
```

`init` writes:

- `tesso.config.json`
- a starter `tokens/` DTCG set (primitives, semantic aliases, light and dark)
- `.tesso/terrazzo.config.ts` (committed; Terrazzo is the engine)
- `public/`
- npm devDependencies for Terrazzo and `tesso-ui`
- `[package.metadata.fusor]` keys `assets = "public"` and `assets-build = ["npx", "tesso-ui", "build"]` when they are missing

`.tesso/` is outside Fusor's default `/.fusor-*/` gitignore, so the Terrazzo config can be committed without an extra exception. That ignore is tracked upstream in [fusor-rs/fusor#23](https://github.com/fusor-rs/fusor/issues/23).

It does **not** call `fusor add`. Add the stylesheets in `<head>`:

```html
<link rel="stylesheet" href="/tokens.css" />
<link rel="stylesheet" href="/tesso.css" />
```

To change a color, edit it in `tokens/color.tokens.json` (for example `color.accent.9`), then rebuild:

```bash
npx tesso-ui build
```

`build` validates the config, runs Terrazzo, and writes `public/tokens.css`. It is safe to run twice. `check` validates DTCG, asserts every semantic color resolves, and asserts the CSS would be non-empty without writing `public/tokens.css`.

```bash
npx tesso-ui check
```

Commit `public/tokens.css` so a Fusor build without Node still has the last stylesheet. `assets-build` refreshes it when Node is available.

`build` and `check` do not move a leftover `.fusor-tokens/` folder. They stop and tell you to run `tesso init --migrate`. That keeps `fusor dev` from moving files on its own. The hook also runs twice ([fusor-rs/fusor#21](https://github.com/fusor-rs/fusor/issues/21)); the build stays idempotent.

## Components

```bash
npx tesso-ui list
npx tesso-ui add button card dialog
```

`add` copies each component's HTML and Rust into the app, appends its CSS to `public/tesso.css`, declares the module in `src/lib.rs`, and adds a `use` in `src/app.rs` when those files exist. It also links `/tesso.css` after `/tokens.css` when that link is missing. It prints what it wrote and a short wiring snippet.

It does not replace a file that is already there unless you pass `--overwrite`. If any requested component already has a file, `add` writes none of that component's files and exits 1. A dependency that is already complete is left in place. An unknown name writes nothing.

Components require `"prefix": "tesso"`. A different prefix would not match the copied CSS.

The parent module that owns the page template must import each component (`use crate::button::Button`). HTML files do not import each other. Component tags are PascalCase and need an explicit closing tag. They sit inside a native HTML element.

### Button

```html
<Button variant="primary" size="md" on_press="{{ state.save.clone() }}">Save</Button>
```

`variant` is `primary`, `secondary`, `quiet`, or `danger`. `size` is `sm`, `md`, or `lg`. Both are `&'static str` literals. `on_press` is `Rc<dyn Fn()>`. Fusor component tags cannot take `on:click` (that attribute is only for native elements), so the copied button calls `on:click` on its own `<button>` and the page passes the callback. Keyboard focus draws a ring from `--tesso-color-focus-ring`.

### Card

```html
<Card title="Shift" description="A short line under the title.">
  <!-- body -->
</Card>
```

`title` and `description` are `&'static str`. The body is the single `<Children>` slot.

### Dialog

```html
<Dialog
  open="{{ state.dialog_open.clone() }}"
  title="Reset the counter?"
  description="This sets the count back to zero."
>
  <Button variant="quiet" size="md" on_press="{{ state.cancel.clone() }}">Cancel</Button>
</Dialog>
```

`open` is a `Signal<bool>` the page owns. Closing the dialog sets it to false. `title` and `description` are static strings.

While `open` is true the dialog:

- sets `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, and `aria-describedby` on the panel
- moves focus to the first tabbable control, or to the panel when there is none
- keeps Tab and Shift+Tab inside the panel
- closes on Escape
- returns focus to the element that opened it

A backdrop click and the Close button also set `open` to false. The page owns the signal, so those paths and Escape all go through the same value.

Fusor has no focus helper and no element ref. `dialog.rs` queries `[data-tesso-dialog]` after the DOM updates. The trap decisions (tab order, initial focus, Escape, whether to restore focus) live in `dialog_a11y.rs` and are covered by `cargo test`. `add dialog` also adds the `web-sys` features that trap uses (`KeyboardEvent`, `HtmlElement`, `Node`, and the listener types). fusor-core does not enable them.

## Fusor wiring

```toml
[package.metadata.fusor]
entry = "web/index.html"
assets = "public"
assets-build = ["npx", "tesso-ui", "build"]
output = "dist"
base-path = "/"
```

`assets-build` is the kebab-case form of fusor-build’s `assets_build`: one program and its arguments, run in the package without a shell before Fusor copies `assets` into the build output. Write each argument as its own string; `["npx tesso-ui build"]` fails with `could not run npx tesso-ui build: No such file or directory` ([fusor-rs/fusor#20](https://github.com/fusor-rs/fusor/issues/20)).

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
    <link rel="stylesheet" href="/tesso.css" />
    <link rel="stylesheet" href="/app.css" />
    <title>My Fusor App</title>
  </head>
  <body>
    <App state="{{ App::new() }}">
      <!-- your markup and components -->
    </App>
  </body>
</html>
```

Leave `data-theme` unset until the reader picks a theme. `tokens.css` then follows `prefers-color-scheme: dark` on `:root:not([data-theme="light"])`. An explicit `data-theme="light"` stays light even when the OS is dark. When a theme is stored, put it on `<html>` and keep `.dark` in sync. Use Fusor `class:name` for component state, not for the theme switch. See `examples/counter-themed` for the Cargo metadata, the HTML links, a FOUC script, and a Rust `ThemeToggle` component.

`tokens/semantic.tokens.json` is the light theme. `tokens/themes/dark.tokens.json` overrides the semantic colors for dark. There is no second copy of the light file. Space, radius, and type stay on `:root`. Shadow offset and blur stay shared; the shadow color (`color.shadow.sm`, `md`, `lg`) changes per theme so the lift is still visible on a dark background.

`color.warning` is a fill and badge color. Text uses `color.warning.fg` (`--tesso-color-warning-fg`): `warning.11` in light, `warning.9` in dark, because `warning.11` on the dark background is about 2.6:1. Light `color.fg.subtle` is about 3.5:1 against `color.bg`, so it is for captions and metadata, not body text. Body copy uses `color.fg` or `color.fg.muted`.

```css
body {
  margin: 0;
  background: var(--tesso-color-bg);
  color: var(--tesso-color-fg);
  font: var(--tesso-font-weight-regular) var(--tesso-font-size-2) / var(--tesso-line-height-normal)
    var(--tesso-font-family-sans);
}
```

## Config

`tesso.config.json` matches `schema.json`:

```json
{
  "$schema": "./node_modules/tesso-ui/schema.json",
  "tokens": ["tokens/**/*.tokens.json"],
  "outFile": "public/tokens.css",
  "engine": "terrazzo",
  "themeAttribute": "data-theme",
  "themes": ["light", "dark"],
  "prefix": "tesso"
}
```

Token ids become variables by replacing `.` with `-`: `color.bg` → `--tesso-color-bg`, `line-height.normal` → `--tesso-line-height-normal`. Group names are kebab-case, matching the CSS custom properties.

An optional `registry` key is an `http` or `https` URL. `add` and `list` reject it for now and tell you the built-in document has the same shape. Omit the key to use the registry shipped in the package (`registry/registry.json`, `registryUrl: null`).

## Registry

Each item names its files, the path they are copied to, CSS appended to `public/tesso.css`, Rust modules, component dependencies, and the DTCG ids the CSS needs. `dialog` depends on `button` and asks for the `web-sys` features its focus trap uses. A later release can fetch this document from a URL without changing the item shape.

## Engine

Terrazzo (`@terrazzo/cli` and `@terrazzo/plugin-css`) is the default. `init` writes a DTCG 2025.10 resolver and a CSS plugin config with `input: { theme: "light" | "dark" }` permutations. The light context is empty: `semantic.tokens.json` in the foundation set is the light source of truth. The CLI then normalizes the stylesheet so aliases resolve to the authored `oklch()` values, the dark block only repeats variables that changed, and the same dark diff is repeated under `@media (prefers-color-scheme: dark)` for `:root:not([data-theme="light"])`.

Style Dictionary is a possible later engine (`usesDtcg`, two selectors or a custom format). Setting `"engine": "style-dictionary"` fails with a clear error. A sketch:

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

## Migrating from fusor-tokens

Tesso is the new name for fusor-tokens. Your tokens and themes carry over as they are. What changes is the package name, the config file and folder, and the CSS prefix, and one command handles all of it.

**1. Run the migration from your app root.**

```bash
npx tesso-ui init
```

When it finds `.fusor-tokens/` or `fusor-tokens.config.json`, it asks before moving anything. In CI or any terminal without a prompt, use `npx tesso-ui init --migrate` instead.

**2. Install the new package.** `init` already swapped `fusor-tokens` for `tesso-ui` in your `package.json`, so this just fetches it.

```bash
npm install
```

**3. Check that everything moved.**

| fusor-tokens | Tesso |
| --- | --- |
| package `fusor-tokens` | package `tesso-ui` |
| command `fusor-tokens` | command `tesso` |
| `fusor-tokens.config.json` | `tesso.config.json` |
| `.fusor-tokens/` | `.tesso/` |
| `--ft-color-bg` and friends | `--tesso-color-bg` and friends |
| `assets-build = ["npx", "fusor-tokens", "build"]` | `assets-build = ["npx", "tesso-ui", "build"]` |

**Good to know**

- `--ft-` is rewritten in `.css`, `.html`, `.rs`, `.js`, `.mjs` and `.md` files, except under `node_modules`, `target`, `dist`, `.git`, `.tmp`, `tokens/`, and hidden directories other than `.tesso`. If you use the variables anywhere else, such as `.ts` or `.scss`, search for leftovers with `grep -rn -- "--ft-" . --exclude-dir=node_modules`.
- `assets-build` is updated when it is `["npx", "fusor-tokens", "build"]` or `["npx","fusor-tokens","build"]`. Any other value is left in place, and `init` prints a note so you can point it at `tesso-ui` yourself.
- If you set your own `prefix` in the config, Tesso keeps that prefix and does not rewrite `--ft-`. The folder, config file, package name, and default `assets-build` still move.
- Token JSON files are never touched.
- `tesso build` and `tesso check` won't run while the old folder or config is still there. They stop and tell you to run `tesso init --migrate`.
- If you added `!/.fusor-tokens/` to your `.gitignore`, you can delete that line. `.tesso/` isn't caught by Fusor's default ignore rule.
- `fusor-tokens` 0.1.x keeps working, but it won't get updates.

## Try the example

```bash
npm install
npm test
npm run preview
```

`npm run preview` serves [`examples/counter-themed`](examples/counter-themed) at `http://127.0.0.1:44731` (set `PORT` to change it). The page toggles `data-theme` against the committed `public/tokens.css` and shows Button, Card, and Dialog. Reset opens the dialog. Escape closes it and returns focus to Reset.

## Non-goals

No Tailwind or UnoCSS export, no multi-brand themes, no Figma sync, no Rust token runtime, and no crates.io Fusor capability. Tokens are files plus a pre-asset script. The registry is bundled; a remote URL is reserved and not fetched yet. The surface is intentionally small for Fusor pre-1.0.

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/jorgefyi/fusor-tokens/issues). To work on the CLI itself:

```bash
npm install
node bin/tesso.js --help
npm test
```

Fusor is pre-1.0. Limits this package works around:

- [fusor-rs/fusor#20](https://github.com/fusor-rs/fusor/issues/20) — `assets-build` is an argv array, not a shell command.
- [fusor-rs/fusor#21](https://github.com/fusor-rs/fusor/issues/21) — `fusor dev` runs that hook twice.
- [fusor-rs/fusor#22](https://github.com/fusor-rs/fusor/issues/22) — a Rust char literal such as `'dark'` inside a template is reported as invalid Rust tokens. Use a double-quoted string inside a single-quoted HTML attribute.
- [fusor-rs/fusor#23](https://github.com/fusor-rs/fusor/issues/23) — `fusor new` ignores `/.fusor-*/`. Tesso uses `.tesso/` so the pipeline config is not ignored.
- [fusor-rs/fusor#24](https://github.com/fusor-rs/fusor/issues/24) — `fusor add` cannot copy component source, so `tesso add` does it.
- `fusor build` does not download its tools. On a fresh machine it exits with `wasm-bindgen 0.2.117 is not available` until you run `fusor install` (or `fusor dev`, which prepares them).
- Component tags cannot take `on:click`. Pass a callback input, or put the listener on a native element inside the component.
- A component template has one native HTML root. Dialog's backdrop and panel share a wrapper.
- There is no element ref. Dialog finds its panel with `[data-tesso-dialog]`.
- fusor-core does not enable the `web-sys` features Dialog uses (`KeyboardEvent`, `HtmlElement`, `Node`, `EventTarget`, and the rest of the listener surface). `add dialog` adds them to the app's `Cargo.toml`.
- An author `display` rule overrides the user-agent `[hidden]` rule. Dialog restates `display: none` on `.tesso-dialog-root[hidden]`.
- A literal component attribute is `&str`, not `String`.
- `<Children>` appears once per component. The caller's template compiles that slot, so Dialog does not import Button when the page passes buttons as children.

## License

[MIT](LICENSE)
