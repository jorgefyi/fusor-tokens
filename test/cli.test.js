import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { run } from "../src/cli.js";
import { SEMANTIC_COLOR_IDS } from "../src/constants.js";

const repo = path.resolve(import.meta.dirname, "..");
fs.mkdirSync(path.join(repo, ".tmp"), { recursive: true });

function capture() {
  let out = "";
  let err = "";
  return {
    stdout: { write: (chunk) => { out += chunk; } },
    stderr: { write: (chunk) => { err += chunk; } },
    text: () => out,
    error: () => err,
  };
}

test("init scaffolds tokens, config, pipeline, and Cargo metadata", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "fusor-init-"));
  fs.writeFileSync(path.join(cwd, "Cargo.toml"), "[package]\nname = \"demo\"\nedition = \"2021\"\n");
  const io = capture();
  const code = await run(["init", "--no-install", "--cwd", cwd], io);
  assert.equal(code, 0, io.error());
  assert.match(io.text(), /link rel="stylesheet" href="\/tokens\.css"/);
  assert.equal(fs.existsSync(path.join(cwd, "tesso.config.json")), true);
  assert.equal(fs.existsSync(path.join(cwd, "tokens/themes/dark.tokens.json")), true);
  assert.equal(fs.existsSync(path.join(cwd, "tokens/themes/light.tokens.json")), false);
  assert.equal(fs.existsSync(path.join(cwd, "tokens/semantic.tokens.json")), true);
  assert.equal(fs.existsSync(path.join(cwd, "public")), true);
  assert.equal(fs.existsSync(path.join(cwd, ".tesso/terrazzo.config.ts")), true);
  const cargo = fs.readFileSync(path.join(cwd, "Cargo.toml"), "utf8");
  assert.match(cargo, /assets = "public"/);
  assert.match(cargo, /assets-build = \["npx", "tesso-ui", "build"\]/);
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
  assert.equal(pkg.devDependencies["@terrazzo/cli"], "^2.7.1");
  assert.equal(pkg.devDependencies["tesso-ui"], "^0.2.0");

  const again = capture();
  assert.equal(await run(["init", "--no-install", "--cwd", cwd], again), 0);
  assert.match(again.text(), /kept existing/);
  const cargoAgain = fs.readFileSync(path.join(cwd, "Cargo.toml"), "utf8");
  assert.equal(cargoAgain.split("assets-build").length, 2);
});

test("build and check produce light and dark --tesso- variables", async () => {
  const cwd = fs.mkdtempSync(path.join(repo, ".tmp", "build-"));
  fs.mkdirSync(cwd, { recursive: true });
  const initIo = capture();
  assert.equal(await run(["init", "--no-install", "--cwd", cwd], initIo), 0, initIo.error());

  const buildIo = capture();
  assert.equal(await run(["build", "--cwd", cwd], buildIo), 0, buildIo.error());
  const cssPath = path.join(cwd, "public/tokens.css");
  const css = fs.readFileSync(cssPath, "utf8");
  assert.match(css, /:root, \[data-theme="light"\]/);
  assert.match(css, /\[data-theme="dark"\], \.dark/);
  assert.match(css, /--tesso-color-bg: oklch\(99% 0\.005 260\);/);
  assert.match(css, /--tesso-color-fg: oklch\(18% 0\.02 260\);/);
  assert.match(css, /--tesso-color-accent: oklch\(55% 0\.18 264\);/);
  assert.match(css, /--tesso-space-1: 4px;/);
  assert.match(css, /--tesso-space-4: 16px;/);
  assert.match(css, /--tesso-radius-md: 8px;/);
  assert.match(css, /--tesso-font-size-2: 14px;/);
  assert.match(css, /--tesso-line-height-normal: 1\.5;/);
  assert.match(css, /--tesso-font-family-sans: system-ui, -apple-system, "Segoe UI", sans-serif;/);
  assert.match(css, /--tesso-shadow-md: 0 4px 12px oklch\(18% 0\.02 260 \/ 0\.12\);/);
  assert.match(css, /--tesso-color-warning-fg: oklch\(46% 0\.12 85\);/);
  assert.match(css, /--tesso-color-focus-ring: oklch\(70% 0\.16 264\);/);
  assert.doesNotMatch(css, /--tesso-lineHeight-/);

  const dark = css.split('[data-theme="dark"], .dark')[1].split("@media")[0];
  assert.match(dark, /--tesso-color-bg: oklch\(18% 0\.02 260\);/);
  assert.match(dark, /--tesso-color-fg: oklch\(99% 0\.005 260\);/);
  assert.match(dark, /--tesso-color-accent: oklch\(70% 0\.16 264\);/);
  assert.match(dark, /--tesso-color-focus-ring: oklch\(92% 0\.04 264\);/);
  assert.match(dark, /--tesso-color-border: oklch\(36% 0\.018 260\);/);
  assert.match(dark, /--tesso-color-border-strong: oklch\(52% 0\.016 260\);/);
  assert.match(dark, /--tesso-color-warning-fg: oklch\(68% 0\.15 85\);/);
  assert.match(dark, /--tesso-shadow-md: 0 4px 12px oklch\(99% 0\.005 260 \/ 0\.10\);/);
  assert.doesNotMatch(dark, /--tesso-space-1/);
  assert.doesNotMatch(dark, /--tesso-font-/);
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(css, /:root:not\(\[data-theme="light"\]\)/);

  const second = fs.readFileSync(cssPath, "utf8");
  const rebuild = capture();
  assert.equal(await run(["build", "--cwd", cwd], rebuild), 0, rebuild.error());
  assert.equal(fs.readFileSync(cssPath, "utf8"), second);

  const before = fs.readFileSync(cssPath, "utf8");
  const checkIo = capture();
  assert.equal(await run(["check", "--cwd", cwd], checkIo), 0, checkIo.error());
  assert.match(checkIo.text(), new RegExp(String(SEMANTIC_COLOR_IDS.length)));
  assert.equal(fs.readFileSync(cssPath, "utf8"), before);

  const broken = path.join(cwd, "tokens/themes/dark.tokens.json");
  const original = fs.readFileSync(broken, "utf8");
  fs.writeFileSync(
    broken,
    original.replace(
      '"ring": { "$type": "color", "$value": "{color.accent.3}" }',
      '"ring": { "$type": "color", "$value": "{color.accent.6}" }',
    ),
  );
  const sameRing = capture();
  assert.equal(await run(["check", "--cwd", cwd], sameRing), 1);
  assert.match(sameRing.error(), /focus ring/);
  assert.equal(fs.readFileSync(cssPath, "utf8"), before);
  fs.writeFileSync(broken, original.replace("{color.gray.12}", "{color.gray.missing}"));
  const bad = capture();
  assert.equal(await run(["check", "--cwd", cwd], bad), 1);
  assert.match(bad.error(), /color\.gray\.missing/);
  assert.equal(fs.readFileSync(cssPath, "utf8"), before);
});

test("style-dictionary engine is rejected", async () => {
  const cwd = fs.mkdtempSync(path.join(repo, ".tmp", "engine-"));
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(
    path.join(cwd, "tesso.config.json"),
    JSON.stringify({
      tokens: ["tokens/**/*.tokens.json"],
      outFile: "public/tokens.css",
      engine: "style-dictionary",
      themeAttribute: "data-theme",
      themes: ["light", "dark"],
      prefix: "ft",
    }),
  );
  const io = capture();
  assert.equal(await run(["check", "--cwd", cwd], io), 1);
  assert.match(io.error(), /style-dictionary/);
});

test("committed example css is a fresh build", async () => {
  const cwd = path.join(repo, "examples/counter-themed");
  const cssPath = path.join(cwd, "public/tokens.css");
  const before = fs.readFileSync(cssPath, "utf8");
  const io = capture();
  assert.equal(await run(["build", "--cwd", cwd], io), 0, io.error());
  assert.equal(fs.readFileSync(cssPath, "utf8"), before);
  const check = capture();
  assert.equal(await run(["check", "--cwd", cwd], check), 0, check.error());
});

test("starter set stays inside the MVP token budget", async () => {
  const cwd = fs.mkdtempSync(path.join(repo, ".tmp", "count-"));
  fs.mkdirSync(cwd, { recursive: true });
  assert.equal(await run(["init", "--no-install", "--cwd", cwd], capture()), 0);
  const { validateTokenSet } = await import("../src/dtcg.js");
  const { readConfig } = await import("../src/config.js");
  const { ids } = validateTokenSet(cwd, readConfig(cwd));
  assert.ok(ids.length >= 60 && ids.length <= 80, `token count ${ids.length}`);
});
