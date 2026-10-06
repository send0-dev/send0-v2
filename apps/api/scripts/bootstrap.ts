/**
 * Creates the shared send0.email domain (if missing), an organization and its first admin API key.
 *
 *   DATABASE_URL=postgres://… pnpm --filter @send0/api bootstrap "Acme" [--test]
 *
 * Prints the key once, or writes it to KEY_FILE (mode 600) if set. Only its hash is kept.
 */
import { newApiKey, newId } from "@send0/core";
import { createDb, schema } from "@send0/db";

const [name, ...flags] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!name || !url) {
  console.error('Usage: DATABASE_URL=postgres://… pnpm bootstrap "<org name>" [--test]');
  process.exit(1);
}
const mode = flags.includes("--test") ? "test" : "live";

const db = createDb(url, { max: 1 });
await db
  .insert(schema.domains)
  .values({ id: newId("dom"), name: "send0.email", kind: "shared", status: "verified", verifiedAt: new Date() })
  .onConflictDoNothing();

const orgId = newId("org");
const secret = await newApiKey(mode);
await db.transaction(async (tx) => {
  await tx.insert(schema.orgs).values({ id: orgId, name });
  await tx.insert(schema.apiKeys).values({
    id: newId("key"),
    orgId,
    name: "Bootstrap admin key",
    prefix: secret.prefix,
    hash: secret.hash,
    mode,
    scopes: ["admin"],
  });
});

console.log(`Created ${orgId} (${name})`);
if (process.env.KEY_FILE) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(process.env.KEY_FILE, `SEND0_API_KEY=${secret.key}\n`, { mode: 0o600 });
  console.log(`Admin API key (${mode}) written to ${process.env.KEY_FILE} (prefix ${secret.prefix})`);
} else {
  console.log(`Admin API key (${mode}), shown once:\n\n  ${secret.key}\n`);
}
process.exit(0);
