import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

/** The migrations shipped with this package; a bundled build passes its own folder instead. */
export const DEFAULT_MIGRATIONS_FOLDER = fileURLToPath(new URL("../migrations", import.meta.url).href);
const defaultFolder = DEFAULT_MIGRATIONS_FOLDER;

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

/**
 * Lists the migrations (journal tags, e.g. `0003_teams`) that `migrateWithLock` would apply, without applying any.
 * Mirrors drizzle's rule: a journal entry is pending when it is newer than the last recorded migration.
 */
export async function pendingMigrations(
  url: string,
  opts: { migrationsFolder?: string; connectTimeoutSeconds?: number } = {},
): Promise<string[]> {
  const folder = opts.migrationsFolder ?? defaultFolder;
  const journal = JSON.parse(readFileSync(path.join(folder, "meta", "_journal.json"), "utf8")) as {
    entries: { tag: string; when: number }[];
  };
  const client = postgres(url, { max: 1, onnotice: () => {}, connect_timeout: opts.connectTimeoutSeconds ?? 10 });
  try {
    const [table] = await client<{ t: string | null }[]>`SELECT to_regclass('drizzle.__drizzle_migrations')::text AS t`;
    if (!table?.t) return journal.entries.map((e) => e.tag);
    const [last] = await client<{ at: string | null }[]>`SELECT max(created_at)::text AS at FROM drizzle.__drizzle_migrations`;
    const lastAt = Number(last?.at ?? 0);
    return journal.entries.filter((e) => e.when > lastAt).map((e) => e.tag);
  } finally {
    await client.end();
  }
}
