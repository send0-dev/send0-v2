import { newId } from "@send0/core";
import { schema } from "@send0/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { purgeDeletedOrgs } from "../src/maintenance";
import { setup, type TestEnv } from "./helpers";

let t: TestEnv;
beforeAll(async () => void (t = await setup()));
afterAll(() => t.close());

describe("purging deleted workspaces", () => {
  it("removes workspaces deleted over 30 days ago, with their data, and keeps recent ones", async () => {
    const now = new Date("2026-11-10T00:00:00Z");
    const old = newId("org");
    const recent = newId("org");
    await t.db.insert(schema.orgs).values([
      { id: old, name: "Old", deletedAt: new Date("2026-10-01T00:00:00Z") },
      { id: recent, name: "Recent", deletedAt: new Date("2026-11-01T00:00:00Z") },
    ]);
    await t.db.insert(schema.inboxes).values({ id: newId("ibx"), orgId: old, domainId: "dom_shared", localPart: "gone" });
    const oldKey = await t.makeKey({ orgId: old });

    expect(await purgeDeletedOrgs(t.db, now)).toBe(1);
    expect(await t.db.select().from(schema.orgs).where(eq(schema.orgs.id, old))).toEqual([]);
    expect(await t.db.select().from(schema.inboxes).where(eq(schema.inboxes.orgId, old))).toEqual([]);
    expect((await t.call("GET", "/v1/inboxes", { key: oldKey })).status).toBe(401);
    expect(await t.db.select().from(schema.orgs).where(eq(schema.orgs.id, recent))).toHaveLength(1);
    expect(await t.db.select().from(schema.orgs).where(eq(schema.orgs.id, t.orgId))).toHaveLength(1);
  });
});
