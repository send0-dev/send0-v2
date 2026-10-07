import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client";
import { migrateBundled } from "../src/migrate-bundled";
import { MIGRATIONS } from "../src/migrations.generated";
import * as schema from "../src/schema";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url).href);
const clients: PGlite[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
});

/** An empty in-memory Postgres (createTestDb is already migrated). */
function freshDb(): { db: Db; client: PGlite } {
  const client = new PGlite();
  clients.push(client);
  return { db: drizzle(client, { schema, casing: "snake_case" }) as unknown as Db, client };
}

const recorded = async (client: PGlite) =>
  (await client.query<{ hash: string; created_at: string }>("SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY id"))
    .rows;

describe("MIGRATIONS", () => {
  it("matches what drizzle's readMigrationFiles computes", () => {
    const drizzleView = readMigrationFiles({ migrationsFolder });
    expect(MIGRATIONS.map((m) => ({ sql: m.statements, folderMillis: m.folderMillis, hash: m.hash }))).toEqual(
      drizzleView.map((m) => ({ sql: m.sql, folderMillis: m.folderMillis, hash: m.hash })),
    );
  });
});

describe("migrateBundled", () => {
  it("applies every migration to a fresh database", async () => {
    const { db, client } = freshDb();
    expect(await migrateBundled(db)).toEqual(MIGRATIONS.map((m) => m.tag));
    const tables = (await client.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")).rows;
    expect(tables.map((t) => t.tablename)).toEqual(expect.arrayContaining(["orgs", "inboxes", "messages", "invites"]));
    expect(await recorded(client)).toEqual(MIGRATIONS.map((m) => ({ hash: m.hash, created_at: String(m.folderMillis) })));
  });

  it("is a no-op the second time", async () => {
    const { db, client } = freshDb();
    await migrateBundled(db);
    expect(await migrateBundled(db)).toEqual([]);
    expect(await recorded(client)).toHaveLength(MIGRATIONS.length);
  });

  it("applies only migrations newer than the last recorded one", async () => {
    const { db, client } = freshDb();
    expect(await migrateBundled(db, MIGRATIONS.slice(0, 2))).toEqual(MIGRATIONS.slice(0, 2).map((m) => m.tag));
    expect(await migrateBundled(db)).toEqual(MIGRATIONS.slice(2).map((m) => m.tag));
    expect(await recorded(client)).toHaveLength(MIGRATIONS.length);
  });

  it("rolls everything back when a statement fails", async () => {
    const { db, client } = freshDb();
    const broken = [
      ...MIGRATIONS.slice(0, 1),
      { tag: "9999_broken", folderMillis: 9e12, hash: "x", statements: ["SELECT nope FROM nowhere"] },
    ];
    await expect(migrateBundled(db, broken)).rejects.toThrow();
    expect((await client.query("SELECT to_regclass('drizzle.__drizzle_migrations') AS t")).rows).toEqual([{ t: null }]);
  });

  it("leaves a database migrated by drizzle's own migrator alone", async () => {
    const { db, client } = freshDb();
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as never, { migrationsFolder });
    expect(await migrateBundled(db)).toEqual([]);
    expect(await recorded(client)).toHaveLength(MIGRATIONS.length);
  });
});
