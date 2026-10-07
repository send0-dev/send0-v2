import postgres from "postgres";
import { afterEach, describe, expect, it } from "vitest";
import { migrateWithLock } from "../src/migrate";
import { createPgTestDatabase, TEST_DATABASE_URL } from "../src/testing-pg";

const drops: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(drops.splice(0).map((drop) => drop()));
});

async function freshDb() {
  const database = await createPgTestDatabase();
  drops.push(database.drop);
  return database.url;
}

async function query<T extends object>(url: string, text: string): Promise<T[]> {
  const sql = postgres(url, { max: 1 });
  try {
    return (await sql.unsafe(text)) as unknown as T[];
  } finally {
    await sql.end();
  }
}

const migrationCount = async (url: string) =>
  Number((await query<{ n: string }>(url, "SELECT count(*) AS n FROM drizzle.__drizzle_migrations"))[0]?.n);

describe.skipIf(!TEST_DATABASE_URL)("createPgTestDatabase", () => {
  it("gives isolated databases that can be dropped", async () => {
    const a = await createPgTestDatabase();
    const b = await createPgTestDatabase();
    await query(a.url, "CREATE TABLE only_in_a (id int)");
    expect(await query(b.url, "SELECT to_regclass('only_in_a') AS t")).toEqual([{ t: null }]);
    await a.drop();
    await b.drop();
    await expect(query(a.url, "SELECT 1")).rejects.toThrow();
  });
});

describe.skipIf(!TEST_DATABASE_URL)("migrateWithLock", () => {
  it("creates the schema on a fresh database", async () => {
    const url = await freshDb();
    await migrateWithLock(url);
    const rows = await query<{ tablename: string }>(url, "SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    expect(rows.map((r) => r.tablename)).toEqual(expect.arrayContaining(["orgs", "messages"]));
  });

  it("is a no-op the second time", async () => {
    const url = await freshDb();
    await migrateWithLock(url);
    const before = await migrationCount(url);
    await migrateWithLock(url);
    expect(await migrationCount(url)).toBe(before);
  });

  it("serialises concurrent callers on the same database", async () => {
    const url = await freshDb();
    await Promise.all([migrateWithLock(url), migrateWithLock(url), migrateWithLock(url)]);
    const journal = (await import("../migrations/meta/_journal.json")) as { default: { entries: unknown[] } };
    expect(await migrationCount(url)).toBe(journal.default.entries.length);
  });
});
