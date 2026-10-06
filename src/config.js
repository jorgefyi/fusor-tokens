import fs from "node:fs";
import path from "node:path";

const THEME_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;
const PREFIX_NAME = /^[A-Za-z][A-Za-z0-9-]*$/;

export const CONFIG_FILENAME = "fusor-tokens.config.json";

export function configPath(cwd) {
  return path.join(cwd, CONFIG_FILENAME);
}

export function readConfig(cwd) {
  const file = configPath(cwd);
  if (!fs.existsSync(file)) {
    throw new Error(
      `Missing ${CONFIG_FILENAME}. Run fusor-tokens init in the app root.`,
    );
  }
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${CONFIG_FILENAME} is not valid JSON (${error.message}).`);
  }
  return validateConfig(json);
}

export function validateConfig(json) {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("fusor-tokens.config.json must be a JSON object.");
  }
  const allowed = new Set([
    "$schema",
    "tokens",
    "outFile",
    "engine",
    "themeAttribute",
    "themes",
    "prefix",
  ]);
  for (const key of Object.keys(json)) {
    if (!allowed.has(key)) {
      throw new Error(`Unknown config key "${key}".`);
    }
  }
  for (const key of ["tokens", "outFile", "engine", "themeAttribute", "themes", "prefix"]) {
    if (json[key] == null) throw new Error(`Config is missing "${key}".`);
  }
  if (!Array.isArray(json.tokens) || json.tokens.length === 0) {
    throw new Error('Config "tokens" must be a non-empty array of globs.');
  }
  if (!json.tokens.every((item) => typeof item === "string" && item.length > 0)) {
    throw new Error('Config "tokens" must contain only non-empty strings.');
  }
  if (typeof json.outFile !== "string" || json.outFile.length === 0) {
    throw new Error('Config "outFile" must be a non-empty string.');
  }
  if (json.engine !== "terrazzo" && json.engine !== "style-dictionary") {
    throw new Error('Config "engine" must be "terrazzo" or "style-dictionary".');
  }
  if (json.engine === "style-dictionary") {
    throw new Error(
      'engine "style-dictionary" is documented as an alternative and is not implemented. Use "terrazzo".',
    );
  }
  if (typeof json.themeAttribute !== "string" || json.themeAttribute.length === 0) {
    throw new Error('Config "themeAttribute" must be a non-empty string.');
  }
  if (!Array.isArray(json.themes) || json.themes.length === 0) {
    throw new Error('Config "themes" must be a non-empty array.');
  }
  const seen = new Set();
  for (const theme of json.themes) {
    if (typeof theme !== "string" || !THEME_NAME.test(theme)) {
      throw new Error(
        `Theme "${theme}" must start with a letter and contain only letters, numbers, "_" or "-".`,
      );
    }
    if (seen.has(theme)) throw new Error(`Theme "${theme}" is listed twice.`);
    seen.add(theme);
  }
  if (typeof json.prefix !== "string" || !PREFIX_NAME.test(json.prefix)) {
    throw new Error(
      'Config "prefix" must start with a letter and contain only letters, numbers, or "-".',
    );
  }
  return json;
}

export function writeDefaultConfig(cwd, config) {
  const file = configPath(cwd);
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  return file;
}
