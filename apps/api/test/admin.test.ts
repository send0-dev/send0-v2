import { newId } from "@send0/core";
import { schema } from "@send0/db";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdminError } from "../src/admin/common";
import { suspendInbox, unsuspendInbox } from "../src/admin/inboxes";
import { pauseSending, resumeSending, setLimit, suspendOrg, unsuspendOrg } from "../src/admin/orgs";
import { findOrgIds, formatOrgReport, orgReport } from "../src/admin/report";
import { suppress, unsuppress } from "../src/admin/suppressions";
import { fanOut } from "../src/webhooks/dispatch";
import { setup, type TestEnv } from "./helpers";

let t: TestEnv;
const now = new Date("2026-11-10T12:00:00Z");
const dry = { apply: false, now };
const apply = { apply: true, now };
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400_000);

beforeAll(async () => void (t = await setup()));
afterAll(() => t.close());

/** An org with one inbox "<local>@send0.email", an owner user, and no mail. */
async function org(local: string, opts: Partial<typeof schema.orgs.$inferInsert> = {}) {
  const id = newId("org");
  await t.db.insert(schema.orgs).values({ id, name: `Org ${local}`, createdAt: daysAgo(40), ...opts });
  const inboxId = newId("ibx");
  await t.db.insert(schema.inboxes).values({ id: inboxId, orgId: id, domainId: "dom_shared", localPart: local, sendPolicy: "open" });
  const userId = newId("usr");
  await t.db.insert(schema.users).values({ id: userId, email: `${local}-owner@example.com`, passwordHash: "x" });
  await t.db.insert(schema.members).values({ orgId: id, userId, role: "owner" });
  return { id, inboxId, userId };
}

const orgRow = async (id: string) => (await t.db.select().from(schema.orgs).where(eq(schema.orgs.id, id)))[0]!;
const inboxRow = async (id: string) => (await t.db.select().from(schema.inboxes).where(eq(schema.inboxes.id, id)))[0]!;

describe("org report", () => {
  it("finds an org by id, inbox id, member email or inbox address, and reports its standing", async () => {
    const o = await org("report-bot", { plan: "pro", dailySendLimit: 400 });
    const [thr] = await t.db
      .insert(schema.threads)
      .values({ id: newId("thr"), orgId: o.id, inboxId: o.inboxId })
      .returning();
    const out = (status: typeof schema.messages.$inferInsert.status, at: Date) => ({
      id: newId("msg"),
      orgId: o.id,
      inboxId: o.inboxId,
      threadId: thr!.id,
      direction: "out" as const,
      status,
      createdAt: at,
    });
    await t.db
      .insert(schema.messages)
      .values([
        ...Array.from({ length: 6 }, () => out("delivered", new Date("2026-11-10T08:00:00Z"))),
        out("failed", new Date("2026-11-10T09:00:00Z")),
        out("bounced", daysAgo(3)),
        out("complained", daysAgo(10)),
        out("delivered", daysAgo(40)),
      ]);

    for (const q of [o.id, o.inboxId, "Report-Bot-Owner@Example.com", "report-bot@send0.email"])
      expect(await findOrgIds(t.db, q)).toEqual([o.id]);

    const r = await orgReport(t.db, o.id, now);
    expect(r.org.plan).toBe("pro");
    expect(r.org.dailySendLimit).toBe(400);
    expect(r.sends).toEqual({ today: 6, last7Days: 7 });
    expect(r.rates).toMatchObject({ rated: 8, bounced: 1, complained: 1, bounceRate: 1 / 8, complaintRate: 1 / 8 });
    expect(r.inboxes).toEqual([{ id: o.inboxId, address: "report-bot@send0.email", status: "active", sendPolicy: "open", mode: "live" }]);
    expect(r.members).toEqual([{ email: "report-bot-owner@example.com", role: "owner" }]);
    expect(formatOrgReport(r).join("\n")).toContain("bounces 1 (12.50%)");
  });

  it("refuses an unknown id, email or address", async () => {
    for (const q of ["org_nope", "ibx_nope", "nobody@example.com", "nope"]) await expect(findOrgIds(t.db, q)).rejects.toThrow(AdminError);
  });
});

describe("write commands", () => {
  it("suspend-org is a dry run without --yes, then blocks the org's API keys", async () => {
    const o = await org("suspend-org-bot");
    const key = await t.makeKey({ orgId: o.id });
    await expect(suspendOrg(t.db, o.id, "  ", apply)).rejects.toThrow(/reason/);

    const planned = await suspendOrg(t.db, o.id, "phishing", dry);
    expect(planned).toEqual({
      target: `org ${o.id} (Org suspend-org-bot)`,
      changes: [{ field: "status", from: "active", to: "suspended" }],
      applied: false,
    });
    expect((await orgRow(o.id)).status).toBe("active");

    expect((await suspendOrg(t.db, o.id, "phishing", apply)).applied).toBe(true);
    expect((await orgRow(o.id)).status).toBe("suspended");
    expect((await t.call("GET", "/v1/inboxes", { key })).status).toBe(403);
    expect((await suspendOrg(t.db, o.id, "again", apply)).changes).toEqual([]);

    expect((await unsuspendOrg(t.db, o.id, apply)).changes).toEqual([{ field: "status", from: "suspended", to: "active" }]);
    expect((await t.call("GET", "/v1/inboxes", { key })).status).toBe(200);
  });

  it("suspend-inbox writes the status and an inbox.suspended outbox event that fans out to webhooks", async () => {
    const o = await org("suspend-inbox-bot");
    const key = await t.makeKey({ orgId: o.id });
    const whk = newId("whk");
    await t.db
      .insert(schema.webhooks)
      .values({ id: whk, orgId: o.id, url: "https://hooks.example.com/x", secret: "whsec_x", events: ["inbox.suspended"] });
    const eventsFor = () => t.db.select().from(schema.events).where(eq(schema.events.inboxId, o.inboxId));

    expect((await suspendInbox(t.db, o.inboxId, "spam", dry)).applied).toBe(false);
    expect(await eventsFor()).toEqual([]);

    const res = await suspendInbox(t.db, o.inboxId, "spam", apply);
    expect(res).toMatchObject({ applied: true, changes: [{ field: "status", from: "active", to: "suspended" }] });
    expect((await inboxRow(o.inboxId)).status).toBe("suspended");
    const [evt] = await eventsFor();
    expect(evt).toMatchObject({
      id: res.eventId,
      orgId: o.id,
      inboxId: o.inboxId,
      type: "inbox.suspended",
      payload: { data: { scope: "inbox", reason: "spam", address: "suspend-inbox-bot@send0.email" } },
      dispatchedAt: null,
      createdAt: now,
    });

    // The outbox sweep hands it to the webhook like any other event.
    expect(await fanOut(t.db, evt!.id, now)).toHaveLength(1);
    const [dlv] = await t.db
      .select()
      .from(schema.deliveries)
      .where(and(eq(schema.deliveries.eventId, evt!.id), eq(schema.deliveries.webhookId, whk)));
    expect(dlv?.status).toBe("pending");

    // A suspended inbox can't send.
    const sent = await t.call("POST", `/v1/inboxes/${o.inboxId}/messages`, {
      key,
      body: { to: "x@example.com", subject: "Hi", text: "Hi" },
    });
    expect(sent.status).toBe(403);

    // Suspending again is a no-op with no second event; unsuspending restores it.
    expect((await suspendInbox(t.db, o.inboxId, "spam", apply)).changes).toEqual([]);
    expect(await eventsFor()).toHaveLength(1);
    expect((await unsuspendInbox(t.db, o.inboxId, apply)).applied).toBe(true);
    expect((await inboxRow(o.inboxId)).status).toBe("active");
  });

  it("pause-sending and resume-sending set and clear the pause, with an org-wide event", async () => {
    const o = await org("pause-bot");
    expect((await pauseSending(t.db, o.id, "manual review", dry)).applied).toBe(false);
    expect((await orgRow(o.id)).sendingPausedAt).toBeNull();

    const res = await pauseSending(t.db, o.id, "manual review", apply);
    expect(res.changes).toEqual([
      { field: "sending_paused_at", from: null, to: now },
      { field: "sending_paused_reason", from: null, to: "manual review" },
    ]);
    expect(await orgRow(o.id)).toMatchObject({ sendingPausedAt: now, sendingPausedReason: "manual review" });
    const [evt] = await t.db.select().from(schema.events).where(eq(schema.events.id, res.eventId!));
    expect(evt).toMatchObject({
      orgId: o.id,
      inboxId: null,
      type: "inbox.suspended",
      payload: { data: { scope: "org", reason: "manual review" } },
    });
    expect((await pauseSending(t.db, o.id, "other", apply)).changes).toEqual([]);

    const resumed = await resumeSending(t.db, o.id, apply);
    expect(resumed.changes.map((c) => c.to)).toEqual([null, null]);
    expect(await orgRow(o.id)).toMatchObject({ sendingPausedAt: null, sendingPausedReason: null });
  });

  it("set-limit changes daily_send_limit and refuses nonsense", async () => {
    const o = await org("limit-bot");
    expect((await setLimit(t.db, o.id, 500, dry)).changes).toEqual([{ field: "daily_send_limit", from: 50, to: 500 }]);
    expect((await orgRow(o.id)).dailySendLimit).toBe(50);
    await setLimit(t.db, o.id, 500, apply);
    expect((await orgRow(o.id)).dailySendLimit).toBe(500);
    for (const bad of [-1, 1.5, Number.NaN, 10_000_000]) await expect(setLimit(t.db, o.id, bad, apply)).rejects.toThrow(AdminError);
  });

  it("suppress and unsuppress add and remove a manual suppression", async () => {
    const o = await org("suppress-bot");
    const rows = () => t.db.select().from(schema.suppressions).where(eq(schema.suppressions.orgId, o.id));
    expect((await suppress(t.db, o.id, "Dana@Example.com", "manual", dry)).changes).toEqual([
      { field: "suppressed", from: "no", to: "manual" },
    ]);
    expect(await rows()).toEqual([]);

    await suppress(t.db, o.id, "Dana@Example.com", "manual", apply);
    expect(await rows()).toMatchObject([{ email: "dana@example.com", reason: "manual" }]);
    expect((await suppress(t.db, o.id, "dana@example.com", "complaint", apply)).changes).toEqual([]);
    await expect(suppress(t.db, o.id, "dana@example.com", "because", apply)).rejects.toThrow(/reason/);
    await expect(suppress(t.db, o.id, "not-an-email", "manual", apply)).rejects.toThrow(AdminError);

    expect((await unsuppress(t.db, o.id, "dana@example.com", apply)).changes).toEqual([{ field: "suppressed", from: "manual", to: "no" }]);
    expect(await rows()).toEqual([]);
  });

  it("every command refuses an unknown id", async () => {
    await expect(suspendOrg(t.db, "org_missing", "x", apply)).rejects.toThrow("No org with id org_missing.");
    await expect(unsuspendOrg(t.db, "org_missing", apply)).rejects.toThrow(AdminError);
    await expect(pauseSending(t.db, "org_missing", "x", apply)).rejects.toThrow(AdminError);
    await expect(resumeSending(t.db, "org_missing", apply)).rejects.toThrow(AdminError);
    await expect(setLimit(t.db, "org_missing", 10, apply)).rejects.toThrow(AdminError);
    await expect(suppress(t.db, "org_missing", "a@b.co", "manual", apply)).rejects.toThrow(AdminError);
    await expect(unsuppress(t.db, "org_missing", "a@b.co", apply)).rejects.toThrow(AdminError);
    await expect(suspendInbox(t.db, "ibx_missing", "x", apply)).rejects.toThrow("No inbox with id ibx_missing.");
    await expect(unsuspendInbox(t.db, "ibx_missing", apply)).rejects.toThrow(AdminError);
  });
});
