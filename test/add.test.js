import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { run } from "../src/cli.js";
import { readComponentText } from "../src/registry.js";

const repo = path.resolve(import.meta.dirname, "..");

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

async function app() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "tesso-add-"));
  fs.writeFileSync(path.join(cwd, "Cargo.toml"), '[package]\nname = "demo"\nedition = "2021"\n\n[dependencies]\nwasm-bindgen = "=0.2.117"\n');
  fs.mkdirSync(path.join(cwd, "src"), { recursive: true });
  fs.writeFileSync(path.join(cwd, "src/lib.rs"), "mod app;\n");
  fs.writeFileSync(path.join(cwd, "src/app.rs"), "use fusor::prelude::*;\nstruct App;\n");
  fs.mkdirSync(path.join(cwd, "web"), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, "web/index.html"),
    '<!doctype html><html><head><link rel="stylesheet" href="/tokens.css" /></head><body></body></html>\n',
  );
  const io = capture();
  assert.equal(await run(["init", "--no-install", "--cwd", cwd], io), 0, io.error());
  return cwd;
}

test("add writes component files and refuses to overwrite them", async () => {
  const cwd = await app();
  const io = capture();
  assert.equal(await run(["add", "button", "card", "--cwd", cwd], io), 0, io.error());
  assert.equal(
    fs.readFileSync(path.join(cwd, "web/components/button.html"), "utf8"),
    readComponentText("button/button.html"),
  );
  assert.equal(fs.readFileSync(path.join(cwd, "src/button.rs"), "utf8"), readComponentText("button/button.rs"));
  assert.match(fs.readFileSync(path.join(cwd, "public/tesso.css"), "utf8"), /--tesso-color-accent/);
  assert.match(fs.readFileSync(path.join(cwd, "src/lib.rs"), "utf8"), /mod button;/);
  assert.match(fs.readFileSync(path.join(cwd, "src/app.rs"), "utf8"), /use crate::button::Button;/);
  assert.match(fs.readFileSync(path.join(cwd, "web/index.html"), "utf8"), /href="\/tesso.css"/);
  assert.match(io.text(), /wrote /);

  fs.writeFileSync(path.join(cwd, "web/components/button.html"), "<!-- local edit -->\n");
  const again = capture();
  assert.equal(await run(["add", "button", "--cwd", cwd], again), 1);
  assert.match(again.text(), /refused to overwrite web\/components\/button.html/);
  assert.equal(fs.readFileSync(path.join(cwd, "web/components/button.html"), "utf8"), "<!-- local edit -->\n");

  const overwrite = capture();
  assert.equal(await run(["add", "button", "--overwrite", "--cwd", cwd], overwrite), 0, overwrite.error());
  assert.equal(
    fs.readFileSync(path.join(cwd, "web/components/button.html"), "utf8"),
    readComponentText("button/button.html"),
  );
});

test("add rejects an unknown component", async () => {
  const cwd = await app();
  const io = capture();
  assert.equal(await run(["add", "slider", "--cwd", cwd], io), 1);
  assert.match(io.error(), /Unknown component slider/);
  assert.equal(fs.existsSync(path.join(cwd, "src/slider.rs")), false);
});

test("add dialog also installs its button dependency", async () => {
  const cwd = await app();
  const io = capture();
  assert.equal(await run(["add", "dialog", "--cwd", cwd], io), 0, io.error());
  assert.equal(fs.existsSync(path.join(cwd, "src/dialog.rs")), true);
  assert.equal(fs.existsSync(path.join(cwd, "src/dialog_a11y.rs")), true);
  assert.equal(fs.existsSync(path.join(cwd, "src/button.rs")), true);
  const cargo = fs.readFileSync(path.join(cwd, "Cargo.toml"), "utf8");
  for (const feature of [
    "Window",
    "Document",
    "Element",
    "HtmlElement",
    "Node",
    "NodeList",
    "Event",
    "EventTarget",
    "KeyboardEvent",
    "DomTokenList",
  ]) {
    assert.match(cargo, new RegExp(`"${feature}"`));
  }
  const html = fs.readFileSync(path.join(cwd, "web/components/dialog.html"), "utf8");
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-labelledby=/);
  assert.match(html, /aria-describedby=/);
});

test("list prints the built-in components", async () => {
  const io = capture();
  assert.equal(await run(["list", "--cwd", repo], io), 0, io.error());
  assert.match(io.text(), /button/);
  assert.match(io.text(), /card/);
  assert.match(io.text(), /dialog/);
});
