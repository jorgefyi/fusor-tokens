import fs from "node:fs";
import path from "node:path";
import { SEMANTIC_COLOR_IDS, TOKEN_TYPES } from "./constants.js";

const ALIAS = /^\{([A-Za-z0-9_.-]+)\}$/;

export function expandGlobs(cwd, patterns) {
  const matches = [];
  for (const pattern of patterns) {
    if (!pattern.includes("*")) {
      const abs = path.resolve(cwd, pattern);
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) matches.push(abs);
      continue;
    }
    matches.push(...walkGlob(cwd, pattern.split("/").filter(Boolean)));
  }
  return [...new Set(matches)].sort();
}

function walkGlob(cwd, segments) {
  const out = [];
  const rec = (dir, index) => {
    if (index === segments.length) return;
    const seg = segments[index];
    if (seg === "**") {
      rec(dir, index + 1);
      if (!fs.existsSync(dir)) return;
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.isDirectory()) rec(path.join(dir, ent.name), index);
      }
      return;
    }
    if (!fs.existsSync(dir)) return;
    const re = segmentRegExp(seg);
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!re.test(ent.name)) continue;
      const next = path.join(dir, ent.name);
      if (index === segments.length - 1) {
        if (ent.isFile()) out.push(next);
      } else if (ent.isDirectory()) {
        rec(next, index + 1);
      }
    }
  };
  rec(cwd, 0);
  return out;
}

function segmentRegExp(segment) {
  const body = segment
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}$`);
}

export function flattenTokens(node, prefix = []) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return [];
  const tokens = [];
  if ("$value" in node) {
    tokens.push({
      id: prefix.join("."),
      $type: node.$type,
      $value: node.$value,
      $description: node.$description,
    });
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("$")) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      tokens.push(...flattenTokens(value, [...prefix, key]));
    }
  }
  return tokens;
}

export function loadTokenFile(file) {
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${file} is not valid JSON (${error.message}).`);
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error(`${file} must be a DTCG JSON object.`);
  }
  const tokens = flattenTokens(json);
  if (tokens.length === 0) {
    throw new Error(`${file} does not contain any DTCG tokens.`);
  }
  for (const token of tokens) {
    if (!token.id) throw new Error(`${file} has a token with an empty id.`);
    if (typeof token.$type !== "string" || !TOKEN_TYPES.has(token.$type)) {
      throw new Error(
        `${file}: ${token.id} has unsupported $type ${JSON.stringify(token.$type)}.`,
      );
    }
  }
  return tokens;
}

export function aliasTarget(value) {
  if (typeof value !== "string") return null;
  const match = ALIAS.exec(value.trim());
  return match ? match[1] : null;
}

function collectAliasTargets(value, found) {
  if (typeof value === "string") {
    const target = aliasTarget(value);
    if (target) found.push(target);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAliasTargets(item, found);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectAliasTargets(item, found);
  }
}

export function assertAliasesResolve(tokens, label) {
  const map = new Map(tokens.map((token) => [token.id, token]));
  const stack = [];
  const visiting = new Set();

  const visit = (id, from) => {
    const token = map.get(id);
    if (!token) {
      throw new Error(`${label}: ${from} references missing token {${id}}.`);
    }
    if (visiting.has(id)) {
      throw new Error(
        `${label}: alias cycle ${[...stack, id].join(" → ")}.`,
      );
    }
    visiting.add(id);
    stack.push(id);
    const targets = [];
    collectAliasTargets(token.$value, targets);
    for (const target of targets) visit(target, id);
    stack.pop();
    visiting.delete(id);
  };

  for (const token of tokens) {
    const targets = [];
    collectAliasTargets(token.$value, targets);
    for (const target of targets) visit(target, token.id);
  }
  return map;
}

export function partitionTokenFiles(files) {
  const foundation = [];
  const themes = new Map();
  for (const file of files) {
    const parts = file.split(path.sep);
    const themeDir = parts.lastIndexOf("themes");
    if (themeDir !== -1 && themeDir < parts.length - 1) {
      const base = path.basename(parts[themeDir + 1], ".tokens.json");
      themes.set(base, file);
    } else {
      foundation.push(file);
    }
  }
  foundation.sort((a, b) => {
    const rank = (file) => (path.basename(file) === "semantic.tokens.json" ? 1 : 0);
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  return { foundation, themes };
}

/**
 * Validate DTCG files and assert every semantic color resolves in each theme.
 * Returns the merged token id list (foundation + every theme overlay).
 */
export function validateTokenSet(cwd, config) {
  const files = expandGlobs(cwd, config.tokens);
  if (files.length === 0) {
    throw new Error(
      `No token files matched ${config.tokens.join(", ")}.`,
    );
  }
  const loaded = new Map(files.map((file) => [file, loadTokenFile(file)]));
  const { foundation, themes } = partitionTokenFiles(files);
  if (foundation.length === 0) {
    throw new Error("Token set has theme files but no foundation tokens.");
  }

  const foundationTokens = foundation.flatMap((file) => loaded.get(file));
  const foundationMap = assertAliasesResolve(foundationTokens, "tokens");

  const ids = new Set(foundationMap.keys());
  for (const theme of config.themes) {
    const file = themes.get(theme);
    if (!file) {
      throw new Error(
        `Missing tokens/themes/${theme}.tokens.json for theme "${theme}".`,
      );
    }
    const overlay = new Map(foundationMap);
    for (const token of loaded.get(file)) overlay.set(token.id, token);
    assertAliasesResolve([...overlay.values()], `theme ${theme}`);
    for (const id of SEMANTIC_COLOR_IDS) {
      const token = overlay.get(id);
      if (!token) {
        throw new Error(`Theme "${theme}" does not define semantic token ${id}.`);
      }
      if (token.$type !== "color") {
        throw new Error(`Theme "${theme}" token ${id} must be $type color.`);
      }
      const target = aliasTarget(token.$value);
      if (target && !overlay.has(target)) {
        throw new Error(`Theme "${theme}" token ${id} does not resolve {${target}}.`);
      }
    }
    for (const id of overlay.keys()) ids.add(id);
  }

  return { files, ids: [...ids].sort() };
}
