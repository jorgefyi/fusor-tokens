import fs from "node:fs";
import path from "node:path";
import { ASSETS_BUILD_COMMAND, ASSETS_BUILD_TOML } from "./constants.js";

const SECTION = "[package.metadata.fusor]";

export function patchCargoToml(source) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const text = source.replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const header = lines.findIndex((line) => line.trim() === SECTION);

  if (header === -1) {
    const block = [
      "",
      SECTION,
      'assets = "public"',
      ASSETS_BUILD_TOML,
      "",
    ].join("\n");
    const body = text.endsWith("\n") || text.length === 0 ? text : `${text}\n`;
    return {
      text: `${body}${block}`.replace(/\n/g, newline),
      notes: [`added ${SECTION}`],
    };
  }

  let end = lines.length;
  for (let i = header + 1; i < lines.length; i++) {
    if (/^\s*\[/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const section = lines.slice(header + 1, end);
  const notes = [];

  // Insert before the section's trailing blank lines so new keys stay inside it visually.
  let insertAt = section.length;
  while (insertAt > 0 && section[insertAt - 1].trim() === "") insertAt--;
  const add = (line) => section.splice(insertAt++, 0, line);

  if (!section.some((line) => /^\s*assets\s*=/.test(line))) {
    add('assets = "public"');
    notes.push('set assets = "public"');
  }

  const buildIndex = section.findIndex((line) => /^\s*assets-build\s*=/.test(line));
  if (buildIndex === -1) {
    add(ASSETS_BUILD_TOML);
    notes.push("set assets-build");
  } else if (section[buildIndex].replace(/\s+/g, "") !== ASSETS_BUILD_TOML.replace(/\s+/g, "")) {
    // assets-build is a single program + args; appending would corrupt it.
    notes.push(
      `kept existing assets-build — Fusor runs one command, so call \`${ASSETS_BUILD_COMMAND}\` from that script yourself`,
    );
  }

  const next = [...lines.slice(0, header + 1), ...section, ...lines.slice(end)];
  return { text: next.join("\n").replace(/\n/g, newline), notes };
}

export function patchCargoFile(cwd) {
  const file = path.join(cwd, "Cargo.toml");
  if (!fs.existsSync(file)) {
    return { file, notes: ["no Cargo.toml found — add [package.metadata.fusor] when the Fusor app exists"] };
  }
  const source = fs.readFileSync(file, "utf8");
  const { text, notes } = patchCargoToml(source);
  if (text !== source) fs.writeFileSync(file, text);
  return { file, notes: notes.length ? notes : ["Cargo.toml already wired"] };
}
