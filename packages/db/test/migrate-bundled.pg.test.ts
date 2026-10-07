import postgres from "postgres";
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "../src/client";
import { migrateWithLock } from "../src/migrate";
import { migrateBundled } from "../src/migrate-bundled";
import { createPgTestDatabase, TEST_DATABASE_URL } from "../src/testing-pg";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((c) => c()));
});

async function freshDb() {
  const database = await createPgTestDatabase();
  cleanups.push(database.drop);
  return database.url;
}

async function query<T extends object>(url: string, text: string): Promise<T[]> {
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    return (await sql.unsafe(text)) as unknown as T[];
  } finally {
    await sql.end();
  }
}

async function bundled(url: string): Promise<void> {
  const db = createDb(url, { max: 2 });
  try {
    await migrateBundled(db);
  } finally {
    await (db as unknown as { $client: { end: () => Promise<void> } }).$client.end();
  }
}

/** What each migrator leaves behind: its bookkeeping rows and the tables and columns it created. */
async function snapshot(url: string) {
  return {
    migrations: await query(url, "SELECT id, hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY id"),
    tables: await query(
      url,
      "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema IN ('public', 'drizzle') ORDER BY 1, 2",
    ),
    columns: await query(
      url,
      `SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
       WHERE table_schema = 'public' ORDER BY 1, 2`,
    ),
  };
}

describe.skipIf(!TEST_DATABASE_URL)("migrateBundled on Postgres", () => {
  it("records exactly what drizzle's migrator records", async () => {
    const [viaDrizzle, viaBundle] = await Promise.all([freshDb(), freshDb()]);
    await migrateWithLock(viaDrizzle);
    await bundled(viaBundle);
    expect(await snapshot(viaBundle)).toEqual(await snapshot(viaDrizzle));
  });

  it("interoperates with migrateWithLock in both directions", async () => {
    const url = await freshDb();
    await bundled(url);
    await migrateWithLock(url);
    await bundled(url);
    const [{ n }] = (await query<{ n: string }>(url, "SELECT count(*)::text AS n FROM drizzle.__drizzle_migrations")) as [{ n: string }];
    const journal = (await import("../migrations/meta/_journal.json")) as { default: { entries: unknown[] } };
    expect(Number(n)).toBe(journal.default.entries.length);
  });

  it("serialises concurrent callers", async () => {
    const url = await freshDb();
    await Promise.all([bundled(url), bundled(url), bundled(url)]);
    const rows = await query<{ n: string }>(url, "SELECT count(*)::text AS n FROM drizzle.__drizzle_migrations");
    const journal = (await import("../migrations/meta/_journal.json")) as { default: { entries: unknown[] } };
    expect(Number(rows[0]?.n)).toBe(journal.default.entries.length);
  });
});
