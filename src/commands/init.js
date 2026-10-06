import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { patchCargoFile } from "../cargo.js";
import {
  ASSETS_BUILD_COMMAND,
  DEFAULT_CONFIG,
  PACKAGE_VERSION,
  TERRAZZO_VERSION,
} from "../constants.js";
import { configPath, writeDefaultConfig } from "../config.js";
import { expandGlobs } from "../dtcg.js";
import { starterRoot, writePipeline } from "../pipeline.js";

export async function initCommand(cwd, { stdout, skipInstall }) {
  const created = [];
  const skipped = [];

  const configFile = configPath(cwd);
  if (fs.existsSync(configFile)) skipped.push(path.basename(configFile));
  else {
    writeDefaultConfig(cwd, DEFAULT_CONFIG);
    created.push(path.basename(configFile));
  }

  const starterTokens = path.join(starterRoot(), "tokens");
  copyTree(starterTokens, path.join(cwd, "tokens"), cwd, created, skipped);

  const publicDir = path.join(cwd, "public");
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
    created.push("public/");
  }

  const tokenFiles = expandGlobs(cwd, DEFAULT_CONFIG.tokens);
  writePipeline(cwd, DEFAULT_CONFIG, tokenFiles);

  const pkgNotes = ensurePackageJson(cwd);
  const cargo = patchCargoFile(cwd);

  if (!skipInstall) await installTerrazzo(cwd);

  const lines = ["fusor-tokens init"];
  if (created.length) lines.push(`  created ${created.join(", ")}`);
  if (skipped.length) lines.push(`  kept existing ${skipped.join(", ")}`);
  lines.push("  wrote .fusor-tokens/terrazzo.config.ts");
  for (const note of pkgNotes) lines.push(`  ${note}`);
  for (const note of cargo.notes) lines.push(`  ${note}`);
  lines.push("");
  lines.push("Add this to the HTML <head>, before other styles:");
  lines.push('  <link rel="stylesheet" href="/tokens.css" />');
  lines.push("");
  lines.push("Then edit a color under tokens/ and run:");
  lines.push("  fusor-tokens build");
  lines.push("");
  lines.push(`Fusor runs \`${ASSETS_BUILD_COMMAND}\` from assets-build before copying public/.`);
  stdout.write(`${lines.join("\n")}\n`);
}

function copyTree(from, to, cwd, created, skipped) {
  fs.mkdirSync(to, { recursive: true });
  for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, ent.name);
    const dest = path.join(to, ent.name);
    if (ent.isDirectory()) {
      copyTree(src, dest, cwd, created, skipped);
      continue;
    }
    const label = path.relative(cwd, dest).split(path.sep).join("/");
    if (fs.existsSync(dest)) skipped.push(label);
    else {
      fs.copyFileSync(src, dest);
      created.push(label);
    }
  }
}

function ensurePackageJson(cwd) {
  const file = path.join(cwd, "package.json");
  const notes = [];
  let pkg = { private: true };
  if (fs.existsSync(file)) {
    try {
      pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      throw new Error(`package.json is not valid JSON (${error.message}).`);
    }
  } else {
    notes.push("created package.json");
  }
  if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) {
    throw new Error("package.json must be a JSON object.");
  }
  pkg.devDependencies ??= {};
  const wanted = {
    "fusor-tokens": `^${PACKAGE_VERSION}`,
    "@terrazzo/cli": TERRAZZO_VERSION,
    "@terrazzo/plugin-css": TERRAZZO_VERSION,
  };
  const added = [];
  for (const [name, version] of Object.entries(wanted)) {
    if (pkg.dependencies?.[name] || pkg.devDependencies?.[name]) continue;
    pkg.devDependencies[name] = version;
    added.push(name);
  }
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  if (added.length) notes.push(`added devDependencies: ${added.join(", ")}`);
  else if (fs.existsSync(file)) notes.push("npm devDependencies already present");
  return notes;
}

function installTerrazzo(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npm",
      ["install", "--save-dev", `@terrazzo/cli@${TERRAZZO_VERSION}`, `@terrazzo/plugin-css@${TERRAZZO_VERSION}`],
      { cwd, stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm install exited ${code}. Re-run init or install @terrazzo/cli yourself.`));
    });
  });
}
