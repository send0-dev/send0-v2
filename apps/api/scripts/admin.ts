/**
 * Operator CLI for abuse handling on a send0 database.
 *
 *   DATABASE_URL=postgres://… pnpm --filter @send0/api admin <command> [args] [--yes]
 *
 * Write commands print a before → after summary and change nothing without --yes.
 * The logic lives in src/admin/ (tested with PGlite); this file parses argv and prints.
 */
import { createDb, type Db } from "@send0/db";
import { AdminError, type AdminResult, type WriteOptions } from "../src/admin/common";
import { suspendInbox, unsuspendInbox } from "../src/admin/inboxes";
import { pauseSending, resumeSending, setLimit, suspendOrg, unsuspendOrg } from "../src/admin/orgs";
import { findOrgIds, formatOrgReport, orgReport } from "../src/admin/report";
import { suppress, unsuppress } from "../src/admin/suppressions";

const USAGE = `Usage: DATABASE_URL=postgres://… pnpm --filter @send0/api admin <command> [args] [--yes]

  org <org_id | ibx_id | member email | inbox address>
  suspend-org <org_id> --reason "…"         unsuspend-org <org_id>
  suspend-inbox <inbox_id> --reason "…"     unsuspend-inbox <inbox_id>
  pause-sending <org_id> --reason "…"       resume-sending <org_id>
  set-limit <org_id> <n>
  suppress <org_id> <email> [--reason manual|bounce|complaint]
  unsuppress <org_id> <email>

Write commands are dry runs unless --yes is given.`;

/** Splits argv into positional args and --flags (`--reason x`, `--reason=x`, `--yes`). */
function parseArgs(argv: string[]): { positional: string[]; reason?: string; yes: boolean } {
  const positional: string[] = [];
  let reason: string | undefined;
  let yes = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--yes" || a === "-y") yes = true;
    else if (a === "--reason") reason = argv[++i];
    else if (a.startsWith("--reason=")) reason = a.slice("--reason=".length);
    else if (a === "--")
      continue; // pnpm may pass one through
    else if (a.startsWith("-")) throw new AdminError(`Unknown option ${a}.\n\n${USAGE}`);
    else positional.push(a);
  }
  return { positional, reason, yes };
}

const show = (v: unknown) => (v instanceof Date ? v.toISOString() : v === null || v === undefined ? "null" : String(v));

function printResult(command: string, res: AdminResult, opts: WriteOptions, reason?: string): void {
  console.log(`${command}: ${res.target}`);
  if (!res.changes.length) {
    console.log("  No change: already in that state.");
    return;
  }
  for (const c of res.changes) console.log(`  ${c.field}: ${show(c.from)} → ${show(c.to)}`);
  if (reason) console.log(`  reason: ${reason}`);
  if (res.eventId) console.log(`  event ${res.eventId} queued for webhooks (outbox)`);
  console.log(opts.apply ? "Applied." : "Dry run: nothing written. Re-run with --yes to apply.");
}

async function run(db: Db, argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const { positional: args, reason, yes } = parseArgs(rest);
  const opts: WriteOptions = { apply: yes, now: new Date() };
  const need = (n: number) => {
    if (args.length !== n) throw new AdminError(`${command} takes ${n} argument${n === 1 ? "" : "s"}.\n\n${USAGE}`);
  };
  const write = async (res: Promise<AdminResult>, why?: string) => printResult(command!, await res, opts, why);

  switch (command) {
    case "org": {
      need(1);
      const ids = await findOrgIds(db, args[0]!);
      for (const id of ids) console.log(formatOrgReport(await orgReport(db, id, opts.now)).join("\n") + "\n");
      return;
    }
    case "suspend-org":
      need(1);
      return write(suspendOrg(db, args[0]!, reason, opts), reason);
    case "unsuspend-org":
      need(1);
      return write(unsuspendOrg(db, args[0]!, opts));
    case "suspend-inbox":
      need(1);
      return write(suspendInbox(db, args[0]!, reason, opts), reason);
    case "unsuspend-inbox":
      need(1);
      return write(unsuspendInbox(db, args[0]!, opts));
    case "pause-sending":
      need(1);
      return write(pauseSending(db, args[0]!, reason, opts));
    case "resume-sending":
      need(1);
      return write(resumeSending(db, args[0]!, opts));
    case "set-limit": {
      need(2);
      const n = Number(args[1]);
      return write(setLimit(db, args[0]!, n, opts));
    }
    case "suppress":
      need(2);
      return write(suppress(db, args[0]!, args[1]!, reason ?? "manual", opts));
    case "unsuppress":
      need(2);
      return write(unsuppress(db, args[0]!, args[1]!, opts));
    default:
      throw new AdminError(command ? `Unknown command ${command}.\n\n${USAGE}` : USAGE);
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`DATABASE_URL is not set.\n\n${USAGE}`);
  process.exit(1);
}
const db = createDb(url, { max: 1 });
try {
  await run(db, process.argv.slice(2));
  process.exit(0);
} catch (err) {
  console.error(err instanceof AdminError ? err.message : `Failed: ${String(err)}`);
  process.exit(1);
}
