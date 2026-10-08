import path from "node:path";
import { readConfig } from "../config.js";
import { validateTokenSet } from "../dtcg.js";
import { assertNoLegacy } from "../migrate.js";
import { compileCss } from "../pipeline.js";

export async function buildCommand(cwd, { stdout }) {
  assertNoLegacy(cwd);
  const config = readConfig(cwd);
  const { files, ids } = validateTokenSet(cwd, config);
  const css = await compileCss(cwd, config, files, ids, config.outFile);
  const count = (css.match(/--/g) ?? []).length;
  stdout.write(
    `wrote ${path.relative(cwd, path.resolve(cwd, config.outFile))} (${ids.length} tokens, ${count} declarations)\n`,
  );
}
