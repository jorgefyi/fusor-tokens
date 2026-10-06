import path from "node:path";
import { buildCommand } from "./commands/build.js";
import { checkCommand } from "./commands/check.js";
import { initCommand } from "./commands/init.js";
import { PACKAGE_VERSION } from "./constants.js";

const HELP = `fusor-tokens — DTCG design tokens to public/tokens.css for Fusor

Usage:
  fusor-tokens init [--no-install]
  fusor-tokens build
  fusor-tokens check

Commands:
  init    Write fusor-tokens.config.json, starter tokens, the Terrazzo
          pipeline, npm devDependencies, and Fusor assets-build metadata
  build   Validate tokens and write public/tokens.css
  check   Validate DTCG, resolve semantic colors, and assert CSS would
          be non-empty. Does not write public/tokens.css

Options:
  --cwd <dir>     App root (default: current directory)
  --no-install    init: do not run npm install
  --help          Show this help
  --version       Print ${PACKAGE_VERSION}
`;

export async function run(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  try {
    const { command, cwd, help, version, skipInstall } = parseArgs(argv, io.cwd);
    if (help || command === "help") {
      stdout.write(HELP);
      return 0;
    }
    if (version) {
      stdout.write(`${PACKAGE_VERSION}\n`);
      return 0;
    }
    if (command === "init") {
      await initCommand(cwd, { stdout, skipInstall });
      return 0;
    }
    if (command === "build") {
      await buildCommand(cwd, { stdout });
      return 0;
    }
    if (command === "check") {
      await checkCommand(cwd, { stdout });
      return 0;
    }
    stderr.write(`Unknown command "${command ?? ""}".\n\n${HELP}`);
    return 1;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }
}

function parseArgs(argv, defaultCwd) {
  let cwd = defaultCwd ?? process.cwd();
  let skipInstall = process.env.FUSOR_TOKENS_SKIP_INSTALL === "1";
  let help = false;
  let version = false;
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") help = true;
    else if (arg === "--version" || arg === "-v") version = true;
    else if (arg === "--no-install") skipInstall = true;
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
  return { command: rest[0], cwd, help, version, skipInstall };
}
