import { schema, type Db } from "@send0/db";
import { migrateWithLock } from "@send0/db/migrate";
import { createPgTestDatabase, TEST_DATABASE_URL } from "@send0/db/testing-pg";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hubName, toEnvelope } from "../../src";
import { PgHub } from "../../src/node/pg-hub";

describe.skipIf(!TEST_DATABASE_URL)("PgHub", () => {
  let drop: () => Promise<void>;
  let url: string;
  let sql: postgres.Sql;
  let db: Db;
  let a: PgHub;
  let b: PgHub;
  let seq = 0;

  beforeAll(async () => {
    ({ url, drop } = await createPgTestDatabase());
    await migrateWithLock(url);
    sql = postgres(url, { max: 2, onnotice: () => {} });
    db = drizzle(sql, { schema, casing: "snake_case" }) as unknown as Db;
    await db.insert(schema.orgs).values({ id: "org_1", name: "Acme" });
    await db.insert(schema.domains).values({ id: "dom_1", name: "send0.email", kind: "shared", status: "verified" });
    await db.insert(schema.inboxes).values({ id: "ibx_1", orgId: "org_1", domainId: "dom_1", localPart: "agent" });
    a = await PgHub.start({ url, db });
    b = await PgHub.start({ url, db });
  });

  afterAll(async () => {
    await a?.stop();
    await b?.stop();
    await sql?.end();
    await drop?.();
  });

  /** Inserts a message.received event row, as ingest would inside its transaction. */
  async function insertEvent(subject: string) {
    const [row] = await db
      .insert(schema.events)
      .values({
        id: `evt_${++seq}`,
        orgId: "org_1",
        inboxId: "ibx_1",
        type: "message.received",
        payload: { data: { id: `msg_${seq}`, direction: "in", from: { email: "noreply@acme.dev" }, subject } },
      })
      .returning();
    return toEnvelope(row!);
  }

  it("delivers an event published on one hub to waits in every process", async () => {
    const since = Date.now() - 1000;
    const onB = b.client.wait("ibx_1", { subject: "your code" }, since, 5000);
    const onA = a.client.wait("ibx_1", { subject: "your code" }, since, 5000); // the publisher's own process too
    const envelope = await insertEvent("Your code is 123456");
    await a.publish("org_1", envelope);
    expect(await onB).toEqual(envelope);
    expect(await onA).toEqual(envelope);
  });

  it("streams the event frame to an org SSE subscriber on another process's hub", async () => {
    const ac = new AbortController();
    const res = await b.client.stream(hubName.org("org_1"), ac.signal);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();

    const envelope = await insertEvent("Streamed");
    await a.publish("org_1", envelope);

    let text = "";
    while (!text.includes("\n\n")) {
      const { value, done } = await reader.read();
      if (done) break;
      text += value;
    }
    expect(text).toContain(`id: ${envelope.id}\nevent: message.received\n`);
    ac.abort();
    await reader.cancel();
  });

  it("times out a wait that matches nothing, then drops the idle hub", async () => {
    expect(b.hasHub(hubName.inbox("ibx_quiet"))).toBe(false);
    const waiting = b.client.wait("ibx_quiet", { subject: "never" }, Date.now(), 200);
    expect(b.hasHub(hubName.inbox("ibx_quiet"))).toBe(true);
    expect(await waiting).toBeNull();
    expect(b.hasHub(hubName.inbox("ibx_quiet"))).toBe(false);
  });

  it("ignores a wait whose filter doesn't match the published event", async () => {
    const waiting = b.client.wait("ibx_1", { subject: "something else" }, Date.now(), 300);
    await a.publish("org_1", await insertEvent("Unrelated"));
    expect(await waiting).toBeNull();
  });

  it("tells open streams to resync after the listener reconnects, and keeps delivering", async () => {
    const ac = new AbortController();
    const res = await b.client.stream(hubName.inbox("ibx_1"), ac.signal);
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    const readUntil = async (needle: string) => {
      let text = "";
      while (!text.includes(needle)) {
        const { value, done } = await reader.read();
        if (done) break;
        text += value;
      }
      return text;
    };

    // Kill every LISTEN connection on this database; postgres.js reconnects them.
    await sql`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND query ILIKE 'listen%'`;
    expect(await readUntil(": resync\n\n")).toContain(": resync");

    const envelope = await insertEvent("After reconnect");
    await a.publish("org_1", envelope);
    expect(await readUntil(`id: ${envelope.id}`)).toContain(`id: ${envelope.id}`);
    ac.abort();
    await reader.cancel();
  });

  it("drops the SSE hub once its subscriber disconnects", async () => {
    const name = hubName.org("org_gone");
    const ac = new AbortController();
    const res = await a.client.stream(name, ac.signal);
    expect(a.hasHub(name)).toBe(true);
    ac.abort();
    await res.body!.cancel();
    expect(a.hasHub(name)).toBe(false);
  });
});
