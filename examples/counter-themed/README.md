# Shift counter

A Fusor 0.1.5 app that shows how `fusor-tokens` lands in a real project. The counter itself is CSS variables: light and dark semantic colors, shared space, radius, and type. Shadow geometry is shared; the shadow color changes with the theme.

`public/tokens.css` is generated and committed. A copy of this folder still has a theme if Node is not installed. `assets-build` refreshes the file when you run `fusor build` or `fusor dev`.

## What is wired

`Cargo.toml` sets:

```toml
assets = "public"
assets-build = ["npx", "fusor-tokens", "build"]
```

`web/index.html` links `/tokens.css` and `/app.css`. It leaves `data-theme` unset unless `localStorage` already has `light` or `dark`, so the page follows `prefers-color-scheme` until the reader chooses. `web/components/theme_toggle.html` is the `ThemeToggle` component (`src/theme_toggle.rs`); it uses `class:name` for the pressed state. `src/theme.rs` sets `data-theme` / `.dark` on `<html>` and stores the choice; with nothing stored, the toggle reflects `prefers-color-scheme`.

## Commands

From the repo root:

```bash
npm install
node bin/fusor-tokens.js check --cwd examples/counter-themed
node bin/fusor-tokens.js build --cwd examples/counter-themed
npm run preview
```

Open http://127.0.0.1:44731 and switch Light / Dark. The page reads the same `public/tokens.css` Fusor would copy.

From this folder, after `npm install` here (the `file:../..` dependency):

```bash
npx fusor-tokens build
fusor dev      # Fusor CLI 0.1.5; runs assets-build, then serves http://127.0.0.1:4173
```

## Edit a color

Change `color.accent.9` in `tokens/color.tokens.json`, run `fusor-tokens build`, and reload. Light semantic colors live in `tokens/semantic.tokens.json`. Dark overrides live only in `tokens/themes/dark.tokens.json`. `color.warning` is the badge fill; warning text uses `color.warning.fg`. Light `color.fg.subtle` is about 3.5:1 on `color.bg` and is not for body text.

## Without Rust

`npm run preview` is a static stand-in so the CSS variables can be checked without the Fusor CLI.
