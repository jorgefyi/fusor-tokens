# Shift counter

A Fusor 0.1.5 app that shows how Tesso lands in a real project. The counter uses copied Button, Card, and Dialog components plus CSS variables: light and dark semantic colors, shared space, radius, and type. Shadow geometry is shared; the shadow color changes with the theme.

`public/tokens.css` and `public/tesso.css` are generated or copied and committed. A copy of this folder still has a theme if Node is not installed. `assets-build` refreshes `tokens.css` when you run `fusor build` or `fusor dev`.

## What is wired

`Cargo.toml` sets:

```toml
assets = "public"
assets-build = ["npx", "tesso-ui", "build"]
```

`web/index.html` links `/tokens.css`, `/tesso.css`, and `/app.css`. It leaves `data-theme` unset unless `localStorage` already has `light` or `dark`, so the page follows `prefers-color-scheme` until the reader chooses. `ThemeToggle` (`src/theme_toggle.rs`) uses `class:name` for the pressed state. `src/theme.rs` sets `data-theme` / `.dark` on `<html>` and stores the choice; with nothing stored, the toggle reflects `prefers-color-scheme`.

The page components were copied with `tesso add button card dialog`:

- `web/components/button.html` and `src/button.rs`
- `web/components/card.html` and `src/card.rs`
- `web/components/dialog.html`, `src/dialog.rs`, and `src/dialog_a11y.rs`

`src/app.rs` imports `Button`, `Card`, and `Dialog`. Reset opens a dialog. Why, inside that dialog, opens a second one on top. Because that click opens one dialog from another, Escape closes only the top dialog. Cancel, the close button, a click outside the panel, and Escape set that dialog's signal to false. Confirm sets the count to zero and closes. Focus returns to the control that opened the dialog.

## Commands

From the repo root:

```bash
npm install
node bin/tesso.js check --cwd examples/counter-themed
node bin/tesso.js build --cwd examples/counter-themed
npm run preview
```

Open http://127.0.0.1:44731 and switch Light / Dark. The page reads the same `public/tokens.css` Fusor would copy. The preview is a static stand-in of the three components.

From this folder, after `npm install` here (the `file:../..` dependency):

```bash
npx tesso-ui build
fusor dev      # Fusor CLI 0.1.5; runs assets-build, then serves http://127.0.0.1:4173
```

## Edit a color

Change `color.accent.9` in `tokens/color.tokens.json`, run `tesso build`, and reload. Light semantic colors live in `tokens/semantic.tokens.json`. Dark overrides live only in `tokens/themes/dark.tokens.json`. `color.warning` is the badge fill; warning text uses `color.warning.fg`. Light `color.fg.subtle` is about 3.5:1 on `color.bg` and is not for body text.

## Without Rust

`npm run preview` is a static stand-in so the CSS variables and the three components can be checked without the Fusor CLI.
