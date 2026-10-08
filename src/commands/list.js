import { loadRegistry } from "../registry.js";

export function listCommand(config, { stdout }) {
  const registry = loadRegistry(config ?? {});
  const lines = [`Components in ${registry.name}:`, ""];
  for (const item of registry.items) {
    const deps = item.dependencies.length ? ` (needs ${item.dependencies.join(", ")})` : "";
    lines.push(`  ${item.name.padEnd(10)} ${item.title} — ${item.description}${deps}`);
  }
  lines.push("");
  lines.push("Add one with `tesso add <component>`. Files already in the app are left alone unless you pass --overwrite.");
  stdout.write(`${lines.join("\n")}\n`);
}
