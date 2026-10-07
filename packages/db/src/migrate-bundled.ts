import { sql } from "drizzle-orm";
import type { Db } from "./client";
import { MIGRATION_LOCK_ID } from "./migration-lock";
import { MIGRATIONS } from "./migrations.generated";

/** One migration as drizzle's migrator sees it, inlined at build time (see scripts/bundle-migrations.ts). */
export interface BundledMigration {
  /** Journal tag, e.g. `0003_teams` */
  tag: string;
  /** The journal's `when`; drizzle records it as `created_at` */
  folderMillis: number;
  /** sha256 hex of the SQL file */
  hash: string;
  statements: string[];
}

/** postgres.js returns rows as an array, PGlite as `{ rows }`. */
const rowsOf = <T>(result: unknown): T[] => (Array.isArray(result) ? (result as T[]) : ((result as { rows: T[] }).rows ?? []));

/**
 * Applies pending bundled migrations in one transaction, under a transaction-scoped advisory lock
 * (Hyperdrive pools per transaction, so a session lock wouldn't hold). Records them in drizzle's own
 * table, so it stays compatible with `drizzle-kit migrate` and `migrateWithLock`. Workers-safe.
 * Returns the tags it applied.
 */
export async function migrateBundled(db: Db, migrations: BundledMigration[] = MIGRATIONS): Promise<string[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_ID.toString()}::bigint)`);
    // The same DDL drizzle's migrator runs.
    await tx.execute(sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )`);
    const [last] = rowsOf<{ created_at: string | number | null }>(
      await tx.execute(sql`SELECT created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`),
    );
    const lastAt = last ? Number(last.created_at) : -Infinity;
    const applied: string[] = [];
    for (const m of migrations) {
      if (m.folderMillis <= lastAt) continue;
      for (const stmt of m.statements) await tx.execute(sql.raw(stmt));
      await tx.execute(sql`INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES (${m.hash}, ${m.folderMillis})`);
      applied.push(m.tag);
    }
    return applied;
  });
}
