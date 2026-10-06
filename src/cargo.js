import fs from "node:fs";
import path from "node:path";
import { ASSETS_BUILD_COMMAND } from "./constants.js";

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
      `assets-build = ["${ASSETS_BUILD_COMMAND}"]`,
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

  if (!section.some((line) => /^\s*assets\s*=/.test(line))) {
    section.push('assets = "public"');
    notes.push('set assets = "public"');
  }

  const buildIndex = section.findIndex((line) => /^\s*assets-build\s*=/.test(line));
  if (buildIndex === -1) {
    section.push(`assets-build = ["${ASSETS_BUILD_COMMAND}"]`);
    notes.push("set assets-build");
  } else {
    const line = section[buildIndex];
    if (!line.includes(ASSETS_BUILD_COMMAND)) {
      if (!/^\s*assets-build\s*=\s*\[.*\]\s*$/.test(line)) {
        throw new Error(
          "Cargo.toml assets-build is not a single-line array. Add \"npx fusor-tokens build\" yourself.",
        );
      }
      section[buildIndex] = line.replace(/\]\s*$/, `, "${ASSETS_BUILD_COMMAND}"]`);
      notes.push("appended assets-build command");
    }
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
