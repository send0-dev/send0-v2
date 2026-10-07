import { randomUUID } from "node:crypto";
import postgres from "postgres";

/** Admin connection URL for a real Postgres; Postgres-backed tests skip themselves when it is unset. */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/** Creates an empty, uniquely named database on TEST_DATABASE_URL and returns its URL plus a `drop` cleanup. */
export async function createPgTestDatabase(): Promise<{ url: string; drop: () => Promise<void> }> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set");
  const name = `send0_t_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const admin = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`CREATE DATABASE "${name}"`);
  } catch (err) {
    await admin.end();
    throw err;
  }
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    drop: async () => {
      try {
        await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
      } finally {
        await admin.end();
      }
    },
  };
}
