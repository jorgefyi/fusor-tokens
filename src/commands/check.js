import { SEMANTIC_COLOR_IDS } from "../constants.js";
import { readConfig } from "../config.js";
import { selectorFor } from "../css.js";
import { validateTokenSet } from "../dtcg.js";
import { compileCssToTemp } from "../pipeline.js";

export async function checkCommand(cwd, { stdout }) {
  const config = readConfig(cwd);
  const { files, ids } = validateTokenSet(cwd, config);
  const css = await compileCssToTemp(cwd, config, files, ids);
  assertCss(css, config);
  stdout.write(
    `ok — ${ids.length} tokens, ${SEMANTIC_COLOR_IDS.length} semantic colors resolve, CSS would be non-empty\n`,
  );
}

export function assertCss(css, config) {
  if (!css || !css.trim()) throw new Error("CSS output would be empty.");
  const light = selectorFor(config.themes[0], 0, config.themeAttribute);
  if (!css.includes(light)) throw new Error(`CSS is missing selector ${light}.`);
  if (config.themes.includes("dark")) {
    const dark = selectorFor("dark", config.themes.indexOf("dark"), config.themeAttribute);
    if (!css.includes(dark)) throw new Error(`CSS is missing selector ${dark}.`);
  }
  if (!css.includes(`--${config.prefix}-`)) {
    throw new Error(`CSS is missing --${config.prefix}- variables.`);
  }
  for (const id of ["color.bg", "color.fg", "color.accent"]) {
    const name = `--${config.prefix}-${id.replaceAll(".", "-")}`;
    if (!css.includes(name)) throw new Error(`CSS is missing ${name}.`);
  }
}
