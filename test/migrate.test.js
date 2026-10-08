import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { run } from "../src/cli.js";
import { LEGACY_ERROR } from "../src/constants.js";

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

function legacyApp() {
  const cwd = fs.mkdtempSync(path.join(repo, ".tmp", "tesso-legacy-"));
  fs.mkdirSync(path.join(cwd, ".fusor-tokens"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".fusor-tokens/terrazzo.config.ts"), "export default {}\n");
  fs.writeFileSync(
    path.join(cwd, "fusor-tokens.config.json"),
    JSON.stringify({
      tokens: ["tokens/**/*.tokens.json"],
      outFile: "public/tokens.css",
      engine: "terrazzo",
      themeAttribute: "data-theme",
      themes: ["light", "dark"],
      prefix: "ft",
    }),
  );
  fs.mkdirSync(path.join(cwd, "public"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "public/app.css"), "body { color: var(--ft-color-fg); }\n");
  fs.writeFileSync(
    path.join(cwd, "package.json"),
    JSON.stringify({ private: true, devDependencies: { "fusor-tokens": "^0.1.1" } }),
  );
  fs.writeFileSync(
    path.join(cwd, "Cargo.toml"),
    '[package]\nname = "demo"\n\n[package.metadata.fusor]\nassets = "public"\nassets-build = ["npx", "fusor-tokens", "build"]\n',
  );
  return cwd;
}

test("init refuses a legacy folder when it cannot ask", async () => {
  const cwd = legacyApp();
  const io = capture();
  const code = await run(["init", "--no-install", "--cwd", cwd], { ...io, isTTY: false });
  assert.equal(code, 1);
  assert.match(io.error(), /--migrate/);
  assert.equal(fs.existsSync(path.join(cwd, ".fusor-tokens")), true);
  assert.equal(fs.existsSync(path.join(cwd, ".tesso")), false);
  assert.equal(LEGACY_ERROR.includes("--migrate"), true);
});

test("init --migrate moves the folder, prefix, and --ft- references", async () => {
  const cwd = legacyApp();
  const io = capture();
  assert.equal(await run(["init", "--migrate", "--no-install", "--cwd", cwd], io), 0, io.error());
  assert.equal(fs.existsSync(path.join(cwd, ".fusor-tokens")), false);
  assert.equal(fs.existsSync(path.join(cwd, ".tesso/terrazzo.config.ts")), true);
  assert.equal(fs.existsSync(path.join(cwd, "fusor-tokens.config.json")), false);
  const config = JSON.parse(fs.readFileSync(path.join(cwd, "tesso.config.json"), "utf8"));
  assert.equal(config.prefix, "tesso");
  assert.match(fs.readFileSync(path.join(cwd, "public/app.css"), "utf8"), /var\(--tesso-color-fg\)/);
  assert.doesNotMatch(fs.readFileSync(path.join(cwd, "public/app.css"), "utf8"), /--ft-/);
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
  assert.equal(pkg.devDependencies["tesso-ui"], "^0.2.0");
  assert.equal(pkg.devDependencies["fusor-tokens"], undefined);
  const cargo = fs.readFileSync(path.join(cwd, "Cargo.toml"), "utf8");
  assert.match(cargo, /assets-build = \["npx", "tesso-ui", "build"\]/);
  assert.doesNotMatch(cargo, /fusor-tokens/);

  const build = capture();
  assert.equal(await run(["build", "--cwd", cwd], build), 0, build.error());
  const css = fs.readFileSync(path.join(cwd, "public/tokens.css"), "utf8");
  assert.match(css, /--tesso-color-bg:/);
  assert.doesNotMatch(css, /--ft-/);
});

test("a custom prefix is kept and --ft- is not rewritten", async () => {
  const cwd = legacyApp();
  const configPath = path.join(cwd, "fusor-tokens.config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.prefix = "brand";
  fs.writeFileSync(configPath, JSON.stringify(config));
  const io = capture();
  assert.equal(await run(["init", "--migrate", "--no-install", "--cwd", cwd], io), 0, io.error());
  const next = JSON.parse(fs.readFileSync(path.join(cwd, "tesso.config.json"), "utf8"));
  assert.equal(next.prefix, "brand");
  assert.match(fs.readFileSync(path.join(cwd, "public/app.css"), "utf8"), /--ft-color-fg/);
  assert.match(io.text(), /kept prefix brand/);
});

test("build tells CI to pass --migrate instead of moving files itself", async () => {
  const cwd = legacyApp();
  const io = capture();
  assert.equal(await run(["build", "--cwd", cwd], io), 1);
  assert.match(io.error(), /tesso init --migrate/);
  assert.equal(fs.existsSync(path.join(cwd, ".fusor-tokens")), true);
});

test("init in a terminal can decline the move", async () => {
  const cwd = legacyApp();
  const io = capture();
  const code = await run(["init", "--no-install", "--cwd", cwd], { ...io, ask: async () => "n" });
  assert.equal(code, 0, io.error());
  assert.match(io.text(), /Nothing was written/);
  assert.equal(fs.existsSync(path.join(cwd, ".fusor-tokens")), true);
  assert.equal(fs.existsSync(path.join(cwd, "tokens")), false);
});
