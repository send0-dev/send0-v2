import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const defaultFolder = fileURLToPath(new URL("../migrations", import.meta.url).href);

/** Fixed pg_advisory_lock key ("send0" + "mig" in ASCII hex) so concurrent booting containers migrate one at a time. */
const MIGRATION_LOCK_ID = 0x73656e6430_6d6967n;

/**
 * Applies pending migrations under a Postgres advisory lock, so several containers can boot at once.
 * Uses drizzle's own bookkeeping (`drizzle.__drizzle_migrations`), so `drizzle-kit migrate` stays compatible.
 * Node-only (reads the migrations folder); import from `@send0/db/migrate`.
 */
export async function migrateWithLock(url: string, opts: { migrationsFolder?: string } = {}): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await client`SELECT pg_advisory_lock(${MIGRATION_LOCK_ID.toString()}::bigint)`;
    try {
      await migrate(drizzle(client), { migrationsFolder: opts.migrationsFolder ?? defaultFolder });
    } finally {
      await client`SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID.toString()}::bigint)`;
    }
  } finally {
    await client.end();
  }
}
