import assert from "node:assert/strict";
import test from "node:test";
import { patchCargoToml } from "../src/cargo.js";

test("appends fusor metadata when the section is missing", () => {
  const { text, notes } = patchCargoToml(`[package]\nname = "demo"\n`);
  assert.match(text, /\[package\.metadata\.fusor\]/);
  assert.match(text, /assets = "public"/);
  assert.match(text, /assets-build = \["npx", "tesso-ui", "build"\]/);
  assert.ok(notes.some((note) => note.includes("package.metadata.fusor")));
});

test("fills missing keys and does not replace an existing assets path", () => {
  const source = `[package.metadata.fusor]
entry = "web/index.html"
assets = "static"
`;
  const { text } = patchCargoToml(source);
  assert.match(text, /assets = "static"/);
  assert.doesNotMatch(text, /assets = "public"/);
  assert.match(text, /assets-build = \["npx", "tesso-ui", "build"\]/);
});

test("leaves an existing assets-build command alone", () => {
  const source = `[package.metadata.fusor]
assets = "public"
assets-build = ["node", "build.mjs"]
`;
  const { text, notes } = patchCargoToml(source);
  assert.equal(text, source);
  assert.ok(notes.some((note) => note.includes("kept existing assets-build")));
});

test("is idempotent and keeps keys inside the section", () => {
  const source = `[package.metadata.fusor]
assets = "public"
output = "dist"

[profile.release]
opt-level = "s"
`;
  const once = patchCargoToml(source).text;
  assert.match(once, /output = "dist"\nassets-build = \["npx", "tesso-ui", "build"\]\n\n\[profile\.release\]/);
  assert.equal(patchCargoToml(once).text, once);
});
