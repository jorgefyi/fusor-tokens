import fs from "node:fs";
import path from "node:path";
import { readConfig } from "../config.js";
import { assertNoLegacy } from "../migrate.js";
import { loadRegistry, projectTokenIds, readComponentText, resolveItems } from "../registry.js";

const CSS_TARGET = "public/tesso.css";

export function addCommand(cwd, names, { stdout, overwrite }) {
  if (names.length === 0) throw new Error("Name at least one component. Run `tesso list` to see them.");
  assertNoLegacy(cwd);
  const config = readConfig(cwd);
  if (config.prefix !== "tesso") {
    throw new Error(
      `Components use --tesso- variables, but tesso.config.json prefix is "${config.prefix}". Set prefix to "tesso" before adding components.`,
    );
  }
  const registry = loadRegistry(config);
  const items = resolveItems(registry, names);
  const ids = new Set(projectTokenIds(cwd, config));
  const missing = [];
  for (const item of items) {
    for (const token of item.tokens) {
      if (!ids.has(token)) missing.push(`${item.name} needs ${token}`);
    }
  }
  if (missing.length) {
    throw new Error(`Token set is missing tokens these components use:\n${missing.map((line) => `  ${line}`).join("\n")}`);
  }

  const requested = new Set(names);
  const written = [];
  const refused = [];
  const kept = [];
  const notes = [];
  let failed = false;

  for (const item of items) {
    const explicit = requested.has(item.name);
    const plan = item.files.map((file) => ({
      source: file.source,
      target: path.join(cwd, file.target),
      label: file.target,
    }));
    const existing = plan.filter((file) => fs.existsSync(file.target));
    if (existing.length && !overwrite) {
      const verb = explicit ? "refused to overwrite" : "kept";
      for (const file of existing) {
        const line = `${verb} ${file.label}`;
        if (explicit) refused.push(line);
        else kept.push(line);
      }
      if (explicit) {
        failed = true;
        const fresh = plan.filter((file) => !fs.existsSync(file.target));
        for (const file of fresh) kept.push(`left ${file.label} unwritten because another ${item.name} file already exists`);
        continue;
      }
      if (existing.length !== plan.length) {
        failed = true;
        refused.push(`refused to update ${item.name}: some of its files already exist and others do not`);
        continue;
      }
      notes.push(...ensureRust(cwd, item));
      continue;
    }
    for (const file of plan) {
      fs.mkdirSync(path.dirname(file.target), { recursive: true });
      fs.writeFileSync(file.target, readComponentText(file.source));
      written.push(file.label);
    }
    const cssNote = writeCssSection(cwd, item, overwrite);
    if (cssNote) notes.push(cssNote);
    notes.push(...ensureRust(cwd, item));
    notes.push(...ensureCargoFeatures(cwd, item));
  }
  notes.push(...ensureStylesheetLink(cwd));

  const lines = [`tesso add ${names.join(" ")}`];
  if (written.length) lines.push(`  wrote ${written.join(", ")}`);
  for (const note of notes) lines.push(`  ${note}`);
  for (const note of kept) lines.push(`  ${note}`);
  for (const note of refused) lines.push(`  ${note} (pass --overwrite to replace it)`);
  lines.push("");
  lines.push("Wire the pieces that were written:");
  lines.push('  <link rel="stylesheet" href="/tesso.css" />');
  lines.push("  <Button variant=\"primary\" size=\"md\" on_press=\"{{ state.save.clone() }}\">Save</Button>");
  lines.push("  <Card title=\"Title\" description=\"Supporting text.\"></Card>");
  lines.push("  <Dialog open=\"{{ state.dialog_open.clone() }}\" title=\"Title\" description=\"What this dialog does.\"></Dialog>");
  lines.push("");
  lines.push("Import each component in the Rust module that owns the template (`use crate::button::Button`),");
  lines.push("and declare `mod button;` in src/lib.rs. `add` inserts those lines when the files are already there.");
  lines.push("Dialog traps focus while it is open. See examples/counter-themed for a working page.");
  stdout.write(`${lines.join("\n")}\n`);
  if (failed) {
    throw new Error("Refused to overwrite existing component files. Re-run with --overwrite to replace them.");
  }
}

function writeCssSection(cwd, item, overwrite) {
  const marker = item.css.marker;
  const start = `/* tesso:${marker} */`;
  const end = `/* /tesso:${marker} */`;
  const body = readComponentText(item.css.source).trim();
  const block = `${start}\n${body}\n${end}\n`;
  const file = path.join(cwd, CSS_TARGET);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\n?`);
  if (pattern.test(current)) {
    if (!overwrite) return `kept ${CSS_TARGET} section ${marker}`;
    fs.writeFileSync(file, current.replace(pattern, block));
    return `updated ${CSS_TARGET} section ${marker}`;
  }
  const next = current.length === 0 ? block : `${current.trimEnd()}\n\n${block}`;
  fs.writeFileSync(file, next.endsWith("\n") ? next : `${next}\n`);
  return `updated ${CSS_TARGET} (${marker})`;
}

function ensureRust(cwd, item) {
  const notes = [];
  const lib = path.join(cwd, "src/lib.rs");
  if (!fs.existsSync(lib)) {
    notes.push("no src/lib.rs — declare the new modules next to mod app");
    return notes;
  }
  let source = fs.readFileSync(lib, "utf8");
  let changed = false;
  for (const rustModule of item.rustModules) {
    const declaration = `mod ${rustModule.module};`;
    if (new RegExp(`^\\s*(pub\\s+)?mod\\s+${rustModule.module}\\s*;`, "m").test(source)) continue;
    source = source.endsWith("\n") ? `${source}${declaration}\n` : `${source}\n${declaration}\n`;
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(lib, source);
    notes.push("updated src/lib.rs");
  }
  const app = path.join(cwd, "src/app.rs");
  if (!fs.existsSync(app)) {
    const uses = item.rustModules.filter((rustModule) => rustModule.use).map((rustModule) => rustModule.use);
    if (uses.length) notes.push(`add to the page module: ${uses.join(" ")}`);
    return notes;
  }
  let appSource = fs.readFileSync(app, "utf8");
  let appChanged = false;
  for (const rustModule of item.rustModules) {
    if (!rustModule.use || appSource.includes(rustModule.use)) continue;
    const uses = [...appSource.matchAll(/^use [^\n]*;\n/gm)];
    if (uses.length) {
      const last = uses[uses.length - 1];
      const at = last.index + last[0].length;
      appSource = `${appSource.slice(0, at)}${rustModule.use}\n${appSource.slice(at)}`;
    } else {
      appSource = `${rustModule.use}\n${appSource}`;
    }
    appChanged = true;
  }
  if (appChanged) {
    fs.writeFileSync(app, appSource);
    notes.push("updated src/app.rs");
  }
  return notes;
}

function ensureCargoFeatures(cwd, item) {
  const features = item.cargo?.webSysFeatures ?? [];
  if (features.length === 0) return [];
  const file = path.join(cwd, "Cargo.toml");
  if (!fs.existsSync(file)) return ["no Cargo.toml — add web-sys with the KeyboardEvent feature for Dialog"];
  const source = fs.readFileSync(file, "utf8");
  const next = ensureWebSysFeatures(source, features);
  if (next === source) return [];
  fs.writeFileSync(file, next);
  return [`enabled web-sys features: ${features.join(", ")}`];
}

export function ensureWebSysFeatures(source, features) {
  if (!source.includes("web-sys")) {
    const line = `web-sys = { version = "0.3", features = [${features.map((feature) => JSON.stringify(feature)).join(", ")}] }\n`;
    const deps = source.indexOf("[dependencies]");
    if (deps === -1) return `${source.trimEnd()}\n\n[dependencies]\n${line}`;
    const insertAt = source.indexOf("\n[", deps + 1);
    if (insertAt === -1) return `${source.trimEnd()}\n${line}`;
    return `${source.slice(0, insertAt)}\n${line}${source.slice(insertAt)}`;
  }
  const match = /web-sys\s*=\s*\{[\s\S]*?features\s*=\s*\[([\s\S]*?)\]/.exec(source);
  if (!match) return source;
  const missing = features.filter((feature) => !match[1].includes(`"${feature}"`));
  if (missing.length === 0) return source;
  const added = missing.map((feature) => `"${feature}"`).join(", ");
  const current = match[1].trim().replace(/,\s*$/, "");
  const insertion = current ? `${current}, ${added}` : added;
  return source.slice(0, match.index) + match[0].replace(match[1], insertion) + source.slice(match.index + match[0].length);
}

function ensureStylesheetLink(cwd) {
  const candidates = ["web/index.html", "index.html"];
  const file = candidates.map((relative) => path.join(cwd, relative)).find((candidate) => fs.existsSync(candidate));
  if (!file) return ['add <link rel="stylesheet" href="/tesso.css" /> to the document head'];
  const source = fs.readFileSync(file, "utf8");
  if (source.includes('href="/tesso.css"') || source.includes("href='/tesso.css'")) return [];
  const link = '    <link rel="stylesheet" href="/tesso.css" />\n';
  const tokens = source.indexOf('href="/tokens.css"');
  if (tokens !== -1) {
    const lineEnd = source.indexOf("\n", tokens);
    const next = `${source.slice(0, lineEnd + 1)}${link}${source.slice(lineEnd + 1)}`;
    fs.writeFileSync(file, next);
    return [`linked /tesso.css from ${path.relative(cwd, file)}`];
  }
  const head = source.indexOf("</head>");
  if (head === -1) return ['add <link rel="stylesheet" href="/tesso.css" /> to the document head'];
  fs.writeFileSync(file, `${source.slice(0, head)}${link}${source.slice(head)}`);
  return [`linked /tesso.css from ${path.relative(cwd, file)}`];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
