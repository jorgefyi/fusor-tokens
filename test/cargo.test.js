import assert from "node:assert/strict";
import test from "node:test";
import { patchCargoToml } from "../src/cargo.js";

test("appends fusor metadata when the section is missing", () => {
  const { text, notes } = patchCargoToml(`[package]\nname = "demo"\n`);
  assert.match(text, /\[package\.metadata\.fusor\]/);
  assert.match(text, /assets = "public"/);
  assert.match(text, /assets-build = \["npx fusor-tokens build"\]/);
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
  assert.match(text, /assets-build = \["npx fusor-tokens build"\]/);
});

test("appends the build command to an existing assets-build array once", () => {
  const source = `[package.metadata.fusor]
assets = "public"
assets-build = ["echo hi"]
`;
  const once = patchCargoToml(source).text;
  assert.match(once, /assets-build = \["echo hi", "npx fusor-tokens build"\]/);
  const twice = patchCargoToml(once).text;
  assert.equal(twice, once);
});
