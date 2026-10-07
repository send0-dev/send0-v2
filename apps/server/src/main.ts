import { pathToFileURL } from "node:url";
import { ConfigError, loadConfig } from "./config";
import { ROLES, startServer, type Role } from "./server";

const USAGE = `Usage: send0 <command>

Commands:
  start [--only=http,worker,smtp]   Run the server (all roles by default)
`;

export type Command = { kind: "start"; roles: Role[] } | { kind: "help" } | { kind: "error"; message: string };

/** Parses `send0 …` arguments (without the node and script paths). Tiny on purpose: no CLI framework. */
export function parseArgs(argv: string[]): Command {
  const [cmd, ...rest] = argv;
  if (cmd === undefined || cmd === "help" || cmd === "--help" || cmd === "-h") return { kind: "help" };
  if (cmd !== "start") return { kind: "error", message: `Unknown command: ${cmd}` };
  let roles: Role[] = [...ROLES];
  for (const arg of rest) {
    const only = /^--only=(.*)$/.exec(arg);
    if (!only) return { kind: "error", message: `Unknown option: ${arg}` };
    const names = only[1]!
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const bad = names.filter((n) => !ROLES.includes(n as Role));
    if (bad.length || !names.length) return { kind: "error", message: `--only takes a list of ${ROLES.join(", ")}` };
    roles = [...new Set(names as Role[])];
  }
  return { kind: "start", roles };
}

/** Runs the CLI and returns the exit code; `start` resolves only after a signal stops the server. */
export async function main(argv: string[]): Promise<number> {
  const cmd = parseArgs(argv);
  switch (cmd.kind) {
    case "help":
      process.stdout.write(USAGE);
      return 0;
    case "error":
      process.stderr.write(`${cmd.message}\n\n${USAGE}`);
      return 2;
    case "start":
      return start(cmd.roles);
  }
}

async function start(roles: Role[]): Promise<number> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`${err.message}\n`);
      return 1;
    }
    throw err;
  }
  const server = await startServer(config, { roles });
  return new Promise<number>((resolve) => {
    let signalled = false;
    const onSignal = (signal: NodeJS.Signals) => {
      if (signalled) {
        console.error(JSON.stringify({ event: "server.forced_exit", signal }));
        process.exit(1);
      }
      signalled = true;
      console.log(JSON.stringify({ event: "server.signal", signal }));
      server.stop().then(
        () => resolve(0),
        (err: unknown) => {
          console.error(JSON.stringify({ event: "server.stop_failed", error: String(err) }));
          resolve(1);
        },
      );
    };
    process.on("SIGTERM", onSignal);
    process.on("SIGINT", onSignal);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(JSON.stringify({ event: "server.crashed", error: String(err), stack: (err as Error).stack }));
      process.exit(1);
    },
  );
}
