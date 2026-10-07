import type { Db } from "@send0/db";
import { migrateBundled } from "@send0/db/migrate-bundled";
import { seedMailDomains } from "@send0/pipeline";

/** How long one invocation waits for its boot before giving up (and answering 503, or throwing). */
export const BOOT_TIMEOUT_MS = 15_000;

/** A boot that didn't finish in time. Fetch turns it into a 503 "starting up"; other handlers throw it. */
export class BootTimeoutError extends Error {
  constructor(ms: number) {
    super(`send0 is starting up: the database boot didn't finish within ${ms}ms`);
    this.name = "BootTimeoutError";
  }
}

/** A per-isolate boot gate: `booted` turns true after the first successful run. */
export interface BootGate {
  (run: () => Promise<void>): Promise<void>;
  readonly booted: boolean;
}

/**
 * Runs `run` on every call until one succeeds, then never again. Nothing in flight is shared: on
 * Workers a promise started by one request dies with that request's I/O, so every invocation that
 * finds the isolate unbooted boots with its own database client. Boot is idempotent and serialised
 * by an advisory lock, so concurrent duplicates are harmless. A run that hangs past `timeoutMs`
 * rejects with BootTimeoutError (it keeps no lock: the transaction ends with its client).
 */
export function bootGate(timeoutMs = BOOT_TIMEOUT_MS): BootGate {
  let booted = false;
  const gate = async (run: () => Promise<void>) => {
    if (booted) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new BootTimeoutError(timeoutMs)), timeoutMs);
    });
    try {
      await Promise.race([run(), expired]);
    } finally {
      clearTimeout(timer);
    }
    booted = true;
  };
  return Object.defineProperty(gate, "booted", { get: () => booted }) as BootGate;
}

/** What every isolate does before its first piece of work: apply pending migrations, then seed the mail domains. */
export async function bootDatabase(db: Db, mailDomains: string[], now = new Date()): Promise<void> {
  const applied = await migrateBundled(db);
  if (applied.length) console.log(JSON.stringify({ event: "migrations.applied", migrations: applied }));
  await seedMailDomains(db, mailDomains, now);
}
