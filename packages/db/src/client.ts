import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

/** Any Drizzle Postgres database with our schema: postgres.js in production, PGlite in tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Connects with postgres.js. On Workers pass Hyperdrive's connectionString; Hyperdrive pools,
 * so keep `max` small and skip the type-fetching round trip.
 */
export function createDb(connectionString: string, opts: { max?: number } = {}): Db {
  const client = postgres(connectionString, { max: opts.max ?? 5, fetch_types: false });
  return drizzle(client, { schema, casing: "snake_case" }) as unknown as Db;
}
