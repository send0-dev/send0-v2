import type { Db } from "@send0/db";
import { migrateBundled } from "@send0/db/migrate-bundled";
import { seedMailDomains } from "@send0/pipeline";

/**
 * Runs `task` once per isolate, sharing one promise between concurrent callers. A failure clears
 * the promise, so the next request (or email, queue batch or cron run) tries again.
 */
export function onceUntilSuccess(): (task: () => Promise<void>) => Promise<void> {
  let pending: Promise<void> | undefined;
  return (task) => {
    pending ??= task().catch((err: unknown) => {
      pending = undefined;
      throw err;
    });
    return pending;
  };
}

/** What every isolate does before its first piece of work: apply pending migrations, then seed the mail domains. */
export async function bootDatabase(db: Db, mailDomains: string[], now = new Date()): Promise<void> {
  const applied = await migrateBundled(db);
  if (applied.length) console.log(JSON.stringify({ event: "migrations.applied", migrations: applied }));
  await seedMailDomains(db, mailDomains, now);
}
