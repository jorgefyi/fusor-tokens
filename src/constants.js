/** Semantic color tokens that must resolve in every theme. */
export const SEMANTIC_COLOR_IDS = [
  "color.bg",
  "color.bg.subtle",
  "color.bg.muted",
  "color.fg",
  "color.fg.muted",
  "color.fg.subtle",
  "color.border",
  "color.border.strong",
  "color.accent",
  "color.accent.fg",
  "color.danger",
  "color.success",
  "color.warning",
  "color.warning.fg",
  "color.focus.ring",
];

/** Shadow tints. Geometry stays put; these colors change per theme. */
export const SHADOW_COLOR_IDS = ["color.shadow.sm", "color.shadow.md", "color.shadow.lg"];

export const TOKEN_TYPES = new Set([
  "color",
  "dimension",
  "fontFamily",
  "fontWeight",
  "number",
  "shadow",
  "string",
]);

export const TERRAZZO_VERSION = "^2.7.1";
export const PACKAGE_VERSION = "0.1.0";

// Fusor's assets-build is one argv (program + args, no shell), not a list of
// shell commands. See fusor-build AppConfig::assets_build.
export const ASSETS_BUILD_ARGV = ["npx", "fusor-tokens", "build"];
export const ASSETS_BUILD_COMMAND = ASSETS_BUILD_ARGV.join(" ");
export const ASSETS_BUILD_TOML = `assets-build = [${ASSETS_BUILD_ARGV.map((a) => JSON.stringify(a)).join(", ")}]`;

export const DEFAULT_CONFIG = {
  $schema: "./node_modules/fusor-tokens/schema.json",
  tokens: ["tokens/**/*.tokens.json"],
  outFile: "public/tokens.css",
  engine: "terrazzo",
  themeAttribute: "data-theme",
  themes: ["light", "dark"],
  prefix: "ft",
};
