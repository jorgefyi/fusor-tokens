import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expandGlobs, loadTokenFile } from "./dtcg.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function registryRoot() {
  return path.join(packageRoot, "registry");
}

export function bundledRegistryPath() {
  return path.join(registryRoot(), "registry.json");
}

/**
 * The built-in registry is a JSON document with a null `registryUrl`.
 * A future release can fetch that same document from `tesso.config.json`'s
 * `registry` URL. The URL is rejected here until that fetch exists.
 */
export function loadRegistry(config = {}) {
  if (config.registry) {
    throw new Error(
      `Remote registry ${config.registry} is not implemented yet. ` +
        "The built-in registry is the same JSON document, with registryUrl set when it is hosted. " +
        'Remove "registry" from tesso.config.json to use the components shipped with tesso-ui.',
    );
  }
  return readRegistryFile(bundledRegistryPath());
}

export function readRegistryFile(file) {
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const errors = validateRegistry(json, path.dirname(file));
  if (errors.length) {
    throw new Error(`Registry ${file} is invalid:\n${errors.map((error) => `  ${error}`).join("\n")}`);
  }
  return json;
}

export function validateRegistry(json, root) {
  const errors = [];
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return ["registry must be a JSON object"];
  }
  if (typeof json.name !== "string" || json.name.length === 0) errors.push("name must be a non-empty string");
  if (!("registryUrl" in json)) errors.push("registryUrl must be present (null while the registry is bundled)");
  else if (json.registryUrl !== null && typeof json.registryUrl !== "string") {
    errors.push("registryUrl must be null or a string");
  }
  if (!Array.isArray(json.items) || json.items.length === 0) {
    errors.push("items must be a non-empty array");
    return errors;
  }
  const names = new Set();
  for (const item of json.items) {
    if (!item || typeof item.name !== "string" || !/^[a-z][a-z0-9-]*$/.test(item.name)) {
      errors.push("each item needs a kebab-case name");
      continue;
    }
    if (names.has(item.name)) errors.push(`duplicate item ${item.name}`);
    names.add(item.name);
    if (typeof item.title !== "string" || item.title.length === 0) errors.push(`${item.name} is missing title`);
    if (typeof item.description !== "string" || item.description.length === 0) {
      errors.push(`${item.name} is missing description`);
    }
    if (!Array.isArray(item.dependencies)) errors.push(`${item.name} dependencies must be an array`);
    if (!Array.isArray(item.tokens) || item.tokens.length === 0) {
      errors.push(`${item.name} tokens must be a non-empty array`);
    } else if (item.tokens.some((token) => typeof token !== "string" || token.length === 0)) {
      errors.push(`${item.name} tokens must be token ids`);
    }
    if (!Array.isArray(item.files) || item.files.length === 0) errors.push(`${item.name} files must be a non-empty array`);
    else {
      for (const file of item.files) {
        if (!file || typeof file.source !== "string" || typeof file.target !== "string") {
          errors.push(`${item.name} has a file without source and target`);
          continue;
        }
        if (!isSafeRelative(file.source) || !isSafeRelative(file.target)) {
          errors.push(`${item.name} file path must stay inside the project: ${file.source} -> ${file.target}`);
          continue;
        }
        if (root && !fs.existsSync(path.join(root, "components", file.source))) {
          errors.push(`${item.name} is missing components/${file.source}`);
        }
      }
    }
    if (!item.css || typeof item.css.source !== "string" || typeof item.css.marker !== "string") {
      errors.push(`${item.name} css needs source and marker`);
    } else if (!isSafeRelative(item.css.source)) {
      errors.push(`${item.name} css source must stay inside the registry`);
    } else if (root && !fs.existsSync(path.join(root, "components", item.css.source))) {
      errors.push(`${item.name} is missing components/${item.css.source}`);
    }
    if (!Array.isArray(item.rustModules) || item.rustModules.length === 0) {
      errors.push(`${item.name} rustModules must list the modules add should declare`);
    }
    if (item.cargo != null) {
      const features = item.cargo.webSysFeatures;
      if (!Array.isArray(features) || features.some((feature) => typeof feature !== "string")) {
        errors.push(`${item.name} cargo.webSysFeatures must be an array of strings`);
      }
    }
  }
  for (const item of json.items) {
    if (!item || !Array.isArray(item.dependencies)) continue;
    for (const dependency of item.dependencies) {
      if (!names.has(dependency)) errors.push(`${item.name} depends on unknown component ${dependency}`);
      if (dependency === item.name) errors.push(`${item.name} depends on itself`);
    }
  }
  return errors;
}

export function resolveItems(registry, requested) {
  const byName = new Map(registry.items.map((item) => [item.name, item]));
  const unknown = requested.filter((name) => !byName.has(name));
  if (unknown.length) {
    const known = registry.items.map((item) => item.name).join(", ");
    throw new Error(`Unknown component ${unknown.join(", ")}. Known components: ${known}. Run \`tesso list\`.`);
  }
  const ordered = [];
  const seen = new Set();
  const visit = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    const item = byName.get(name);
    for (const dependency of item.dependencies) visit(dependency);
    ordered.push(item);
  };
  for (const name of requested) visit(name);
  return ordered;
}

export function readComponentText(relativeSource) {
  return fs.readFileSync(path.join(registryRoot(), "components", relativeSource), "utf8");
}

export function projectTokenIds(cwd, config) {
  const files = expandGlobs(cwd, config.tokens);
  const ids = [];
  for (const file of files) {
    for (const token of loadTokenFile(file)) ids.push(token.id);
  }
  return ids;
}

function isSafeRelative(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.startsWith("/") || value.includes("\\") || value.split("/").includes("..")) return false;
  return true;
}
