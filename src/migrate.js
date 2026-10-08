import fs from "node:fs";
import path from "node:path";
import {
  CONFIG_FILENAME,
  DEFAULT_PREFIX,
  LEGACY_CONFIG_FILENAME,
  LEGACY_ERROR,
  LEGACY_PIPELINE_DIR,
  LEGACY_PREFIX,
  PACKAGE_NAME,
  PACKAGE_VERSION,
  PIPELINE_DIR,
} from "./constants.js";

const SKIP_DIRS = new Set(["node_modules", "target", "dist", ".git", ".tmp"]);
const TEXT_EXTENSIONS = new Set([".css", ".html", ".rs", ".js", ".mjs", ".md"]);

export function legacyState(cwd) {
  return {
    legacyDir: fs.existsSync(path.join(cwd, LEGACY_PIPELINE_DIR)),
    legacyConfig: fs.existsSync(path.join(cwd, LEGACY_CONFIG_FILENAME)),
    nextDir: fs.existsSync(path.join(cwd, PIPELINE_DIR)),
    nextConfig: fs.existsSync(path.join(cwd, CONFIG_FILENAME)),
  };
}

export function hasLegacy(cwd) {
  const state = legacyState(cwd);
  return state.legacyDir || state.legacyConfig;
}

export function assertNoLegacy(cwd) {
  if (hasLegacy(cwd)) throw new Error(LEGACY_ERROR);
}

/**
 * Move `.fusor-tokens/` to `.tesso/` and `fusor-tokens.config.json` to
 * `tesso.config.json`. When the old prefix was `ft` (or there was no config,
 * so the 0.1 default applies), rewrite `--ft-` to `--tesso-` in project
 * CSS, HTML, Rust, JS, and Markdown. Token JSON is left alone: DTCG values
 * are not CSS variables. A custom prefix is kept and `--ft-` is not touched.
 */
export function migrateProject(cwd) {
  const state = legacyState(cwd);
  const notes = [];
  if (state.legacyDir && state.nextDir) {
    throw new Error(
      "Both .fusor-tokens/ and .tesso/ exist. Move or delete one of them, then re-run `tesso init --migrate`.",
    );
  }
  if (state.legacyConfig && state.nextConfig) {
    throw new Error(
      "Both fusor-tokens.config.json and tesso.config.json exist. Keep one, then re-run `tesso init --migrate`.",
    );
  }

  let rewritePrefix = !state.legacyConfig;
  if (state.legacyDir) {
    fs.renameSync(path.join(cwd, LEGACY_PIPELINE_DIR), path.join(cwd, PIPELINE_DIR));
    notes.push("moved .fusor-tokens/ to .tesso/");
  }

  if (state.legacyConfig) {
    const file = path.join(cwd, LEGACY_CONFIG_FILENAME);
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    rewritePrefix = config.prefix === LEGACY_PREFIX;
    if (rewritePrefix) config.prefix = DEFAULT_PREFIX;
    if (typeof config.$schema === "string") {
      config.$schema = config.$schema.replaceAll("fusor-tokens", PACKAGE_NAME);
    }
    fs.writeFileSync(path.join(cwd, CONFIG_FILENAME), `${JSON.stringify(config, null, 2)}\n`);
    fs.unlinkSync(file);
    notes.push(
      rewritePrefix
        ? "renamed fusor-tokens.config.json to tesso.config.json and set prefix to tesso"
        : `renamed fusor-tokens.config.json to tesso.config.json and kept prefix ${config.prefix}`,
    );
  }

  notes.push(...rewritePackageJson(cwd));
  notes.push(...rewriteCargo(cwd));
  if (rewritePrefix) {
    const rewritten = rewritePrefixInTree(cwd);
    notes.push(
      rewritten.length
        ? `renamed --ft- to --tesso- in ${rewritten.join(", ")}`
        : "no --ft- references found outside token JSON",
    );
  } else {
    notes.push("left --ft- references alone because the config prefix was not ft");
  }
  return notes;
}

function rewritePackageJson(cwd) {
  const file = path.join(cwd, "package.json");
  if (!fs.existsSync(file)) return [];
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  const notes = [];
  for (const field of ["dependencies", "devDependencies"]) {
    const deps = pkg[field];
    if (!deps || !Object.prototype.hasOwnProperty.call(deps, "fusor-tokens")) continue;
    if (!deps[PACKAGE_NAME]) {
      const current = deps["fusor-tokens"];
      deps[PACKAGE_NAME] = typeof current === "string" && current.startsWith("file:")
        ? current
        : `^${PACKAGE_VERSION}`;
    }
    delete deps["fusor-tokens"];
    notes.push(`renamed the ${field} entry fusor-tokens to ${PACKAGE_NAME}`);
  }
  if (notes.length) fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  return notes;
}

function rewriteCargo(cwd) {
  const file = path.join(cwd, "Cargo.toml");
  if (!fs.existsSync(file)) return [];
  const source = fs.readFileSync(file, "utf8");
  const next = source
    .replaceAll('["npx", "fusor-tokens", "build"]', '["npx", "tesso-ui", "build"]')
    .replaceAll('["npx","fusor-tokens","build"]', '["npx", "tesso-ui", "build"]');
  if (next === source) {
    if (source.includes("fusor-tokens")) {
      return [
        "found fusor-tokens in Cargo.toml but not the default assets-build argv — update that command yourself",
      ];
    }
    return [];
  }
  fs.writeFileSync(file, next);
  return ["updated Cargo.toml assets-build to npx tesso-ui build"];
}

function rewritePrefixInTree(cwd) {
  const rewritten = [];
  const visit = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith(".") && ent.name !== PIPELINE_DIR) continue;
      if (SKIP_DIRS.has(ent.name)) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "tokens") continue;
        visit(full);
        continue;
      }
      if (!TEXT_EXTENSIONS.has(path.extname(ent.name))) continue;
      const text = fs.readFileSync(full, "utf8");
      if (!text.includes("--ft-")) continue;
      const next = text.replaceAll("--ft-", "--tesso-");
      if (next !== text) {
        fs.writeFileSync(full, next);
        rewritten.push(path.relative(cwd, full).split(path.sep).join("/"));
      }
    }
  };
  visit(cwd);
  return rewritten;
}

export { LEGACY_ERROR };
