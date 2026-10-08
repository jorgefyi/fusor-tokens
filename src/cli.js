import path from "node:path";
import { addCommand } from "./commands/add.js";
import { buildCommand } from "./commands/build.js";
import { checkCommand } from "./commands/check.js";
import { initCommand } from "./commands/init.js";
import { listCommand } from "./commands/list.js";
import { PACKAGE_VERSION } from "./constants.js";
import { readConfig } from "./config.js";

const HELP = `tesso — DTCG tokens and components for Fusor

Usage:
  tesso init [--no-install] [--migrate]
  tesso build
  tesso check
  tesso add <component...> [--overwrite]
  tesso list

Commands:
  init    Write tesso.config.json, starter tokens, the Terrazzo pipeline,
          npm devDependencies, and Fusor assets-build metadata. If a
          .fusor-tokens/ folder is present, ask to move it to .tesso/.
          --migrate does that without a prompt.
  build   Validate tokens and write public/tokens.css
  check   Validate DTCG, resolve semantic colors, and assert CSS would
          be non-empty. Does not write public/tokens.css
  add     Copy component source into this Fusor app
  list    Show the components in the built-in registry

Options:
  --cwd <dir>     App root (default: current directory)
  --no-install    init: do not run npm install
  --migrate       init: move .fusor-tokens/ to .tesso/ without asking
  --overwrite     add: replace component files that already exist
  --help          Show this help
  --version       Print ${PACKAGE_VERSION}
`;

export async function run(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  try {
    const parsed = parseArgs(argv, io.cwd);
    if (parsed.help || parsed.command === "help") {
      stdout.write(HELP);
      return 0;
    }
    if (parsed.version) {
      stdout.write(`${PACKAGE_VERSION}\n`);
      return 0;
    }
    if (parsed.command === "init") {
      await initCommand(parsed.cwd, {
        stdout,
        skipInstall: parsed.skipInstall,
        migrate: parsed.migrate,
        ask: io.ask,
        isTTY: io.isTTY,
      });
      return 0;
    }
    if (parsed.command === "build") {
      await buildCommand(parsed.cwd, { stdout });
      return 0;
    }
    if (parsed.command === "check") {
      await checkCommand(parsed.cwd, { stdout });
      return 0;
    }
    if (parsed.command === "list") {
      listCommand(readOptionalConfig(parsed.cwd), { stdout });
      return 0;
    }
    if (parsed.command === "add") {
      addCommand(parsed.cwd, parsed.args, { stdout, overwrite: parsed.overwrite });
      return 0;
    }
    stderr.write(`Unknown command "${parsed.command ?? ""}".\n\n${HELP}`);
    return 1;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }
}

function readOptionalConfig(cwd) {
  try {
    return readConfig(cwd);
  } catch {
    return {};
  }
}

function parseArgs(argv, defaultCwd) {
  let cwd = defaultCwd ?? process.cwd();
  let skipInstall = process.env.TESSO_SKIP_INSTALL === "1" || process.env.FUSOR_TOKENS_SKIP_INSTALL === "1";
  let help = false;
  let version = false;
  let overwrite = false;
  let migrate = false;
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") help = true;
    else if (arg === "--version" || arg === "-v") version = true;
    else if (arg === "--no-install") skipInstall = true;
    else if (arg === "--overwrite") overwrite = true;
    else if (arg === "--migrate") migrate = true;
    else if (arg === "--cwd") {
      const value = argv[++i];
      if (!value) throw new Error("--cwd needs a directory.");
      cwd = path.resolve(value);
    } else if (arg.startsWith("--cwd=")) {
      cwd = path.resolve(arg.slice("--cwd=".length));
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option ${arg}.`);
    } else rest.push(arg);
  }
  return {
    command: rest[0],
    args: rest.slice(1),
    cwd,
    help,
    version,
    skipInstall,
    overwrite,
    migrate,
  };
}
