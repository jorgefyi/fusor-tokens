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
  assert.equal(fs.existsSync(path.join(cwd, "fusor-tokens.config.json")), true);
  assert.equal(fs.existsSync(path.join(cwd, "tokens/themes/dark.tokens.json")), true);
  assert.equal(fs.existsSync(path.join(cwd, "public")), true);
  assert.equal(fs.existsSync(path.join(cwd, ".fusor-tokens/terrazzo.config.ts")), true);
  const cargo = fs.readFileSync(path.join(cwd, "Cargo.toml"), "utf8");
  assert.match(cargo, /assets = "public"/);
  assert.match(cargo, /npx fusor-tokens build/);
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
  assert.equal(pkg.devDependencies["@terrazzo/cli"], "^2.7.1");
  assert.equal(pkg.devDependencies["fusor-tokens"], "^0.1.0");

  const again = capture();
  assert.equal(await run(["init", "--no-install", "--cwd", cwd], again), 0);
  assert.match(again.text(), /kept existing/);
  const cargoAgain = fs.readFileSync(path.join(cwd, "Cargo.toml"), "utf8");
  assert.equal(cargoAgain.split("npx fusor-tokens build").length, 2);
});

test("build and check produce light and dark --ft variables", async () => {
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
  assert.match(css, /--ft-color-bg: oklch\(99% 0\.005 260\);/);
  assert.match(css, /--ft-color-fg: oklch\(18% 0\.02 260\);/);
  assert.match(css, /--ft-color-accent: oklch\(55% 0\.18 264\);/);
  assert.match(css, /--ft-space-1: 4px;/);
  assert.match(css, /--ft-space-4: 16px;/);
  assert.match(css, /--ft-radius-md: 8px;/);
  assert.match(css, /--ft-font-size-2: 14px;/);
  assert.match(css, /--ft-lineHeight-normal: 1\.5;/);
  assert.match(css, /--ft-font-family-sans: system-ui, -apple-system, "Segoe UI", sans-serif;/);
  assert.match(css, /--ft-shadow-md: 0 4px 12px oklch\(18% 0\.02 260 \/ 0\.12\);/);
  assert.doesNotMatch(css, /--ft-line-height-/);

  const dark = css.split('[data-theme="dark"], .dark')[1];
  assert.match(dark, /--ft-color-bg: oklch\(18% 0\.02 260\);/);
  assert.match(dark, /--ft-color-fg: oklch\(99% 0\.005 260\);/);
  assert.match(dark, /--ft-color-accent: oklch\(70% 0\.16 264\);/);
  assert.doesNotMatch(dark, /--ft-space-1/);
  assert.doesNotMatch(dark, /--ft-shadow-md/);
  assert.doesNotMatch(dark, /--ft-font-/);

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
    path.join(cwd, "fusor-tokens.config.json"),
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
