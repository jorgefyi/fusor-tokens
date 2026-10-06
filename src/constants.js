/** Semantic color tokens. Only these change between light and dark. */
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
  "color.focus.ring",
];

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

export const ASSETS_BUILD_COMMAND = "npx fusor-tokens build";

export const DEFAULT_CONFIG = {
  $schema: "./node_modules/fusor-tokens/schema.json",
  tokens: ["tokens/**/*.tokens.json"],
  outFile: "public/tokens.css",
  engine: "terrazzo",
  themeAttribute: "data-theme",
  themes: ["light", "dark"],
  prefix: "ft",
};
