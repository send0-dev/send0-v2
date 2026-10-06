import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { deliver, fixture, setup, type TestEnv } from "./helpers";

let t: TestEnv;
let inboxId: string;
let otherInboxId: string;
const ids: Record<string, string> = {};

beforeAll(async () => {
  t = await setup();
  inboxId = (await t.call("POST", "/v1/inboxes", { body: { name: "procurement-agent" } })).body.id;
  otherInboxId = (await t.call("POST", "/v1/inboxes", { body: { name: "other" } })).body.id;
  const at = (min: number) => new Date(Date.UTC(2026, 9, 5, 10, min));
  for (const [i, name] of ["gmail-reply.eml", "otp-html-only.eml", "attachment-pdf.eml", "forwarded.eml"].entries()) {
    const r = await deliver(t.db, "procurement-agent@send0.email", fixture(name), at(i));
    ids[name] = r.messageId;
  }
  await deliver(t.db, "other@send0.email", fixture("magic-link.eml"), at(9));
});
afterAll(() => t.close());

describe("messages", () => {
  it("lists newest first with attachments and extracted fields, no html", async () => {
    const r = await t.call("GET", `/v1/inboxes/${inboxId}/messages`);
    expect(r.status).toBe(200);
    expect(r.body.data.map((m: any) => m.id)).toEqual([ids["forwarded.eml"], ids["attachment-pdf.eml"], ids["otp-html-only.eml"], ids["gmail-reply.eml"]]);
    const pdf = r.body.data[1];
    expect(pdf.attachments).toEqual([expect.objectContaining({ filename: "price-list.pdf", content_type: "application/pdf" })]);
    expect(pdf.html).toBeUndefined();
    expect(r.body.data[2].extracted).toMatchObject({ otp: "482913", action_link: expect.stringContaining("/verify") });
  });

  it("filters by sender wildcard, subject, direction, time and full-text", async () => {
    const q = async (qs: string) => (await t.call("GET", `/v1/inboxes/${inboxId}/messages?${qs}`)).body.data.map((m: any) => m.id);
    expect(await q("from=*@acme.dev")).toEqual([ids["otp-html-only.eml"]]);
    expect(await q("from=DANA@gmail.com")).toEqual([ids["gmail-reply.eml"]]);
    expect(await q("subject=price")).toEqual([ids["attachment-pdf.eml"]]);
    expect(await q("direction=out")).toEqual([]);
    expect(await q("since=2026-10-05T10:02:00Z")).toEqual([ids["forwarded.eml"], ids["attachment-pdf.eml"]]);
    expect(await q("q=thursday")).toEqual([ids["gmail-reply.eml"]]);
    expect(await q("q=" + encodeURIComponent('"last month"'))).toEqual([ids["forwarded.eml"]]);
  });

  it("treats % and _ in filters literally", async () => {
    expect((await t.call("GET", `/v1/inboxes/${inboxId}/messages?from=%25`)).body.data).toEqual([]);
  });

  it("returns one message with html", async () => {
    const r = await t.call("GET", `/v1/messages/${ids["otp-html-only.eml"]}`);
    expect(r.body).toMatchObject({ object: "message", id: ids["otp-html-only.eml"], inbox_id: inboxId, direction: "in" });
    expect(r.body.html).toContain("482913");
  });

  it("redirects /raw to a short-lived download link", async () => {
    const res = await t.app.request(`/v1/messages/${ids["gmail-reply.eml"]}/raw`, { headers: { authorization: `Bearer ${t.adminKey}` } });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(new RegExp(`^https://files\\.test/raw/org_\\w+/${ids["gmail-reply.eml"]}\\.eml\\?expires=900`));
  });

  it("returns attachment metadata with a download link", async () => {
    const msg = (await t.call("GET", `/v1/messages/${ids["attachment-pdf.eml"]}`)).body;
    const att = msg.attachments[0];
    const r = await t.call("GET", `/v1/messages/${msg.id}/attachments/${att.id}`);
    expect(r.body).toMatchObject({ object: "attachment", id: att.id, filename: "price-list.pdf", message_id: msg.id });
    expect(r.body.download_url).toContain(`att/`);
    expect(r.body.download_url).toContain("name=price-list.pdf");
    expect(new Date(r.body.expires_at).getTime()).toBeGreaterThan(Date.now());
    expect((await t.call("GET", `/v1/messages/${msg.id}/attachments/att_nope`)).status).toBe(404);
  });
});

describe("messages across inboxes", () => {
  it("lists every inbox newest first, with inbox, status and search filters", async () => {
    const all = (await t.call("GET", "/v1/messages")).body.data.map((m: any) => m.id);
    expect(all).toHaveLength(5);
    expect(all.slice(1)).toEqual([ids["forwarded.eml"], ids["attachment-pdf.eml"], ids["otp-html-only.eml"], ids["gmail-reply.eml"]]);
    expect((await t.call("GET", `/v1/messages?inbox_id=${otherInboxId}`)).body.data).toHaveLength(1);
    expect((await t.call("GET", "/v1/messages?status=received&direction=in")).body.data).toHaveLength(5);
    expect((await t.call("GET", "/v1/messages?status=sent")).body.data).toHaveLength(0);
    expect((await t.call("GET", "/v1/messages?q=invoice")).body.data.every((m: any) => m.inbox_id === inboxId)).toBe(true);
  });

  it("pages with a cursor", async () => {
    const p1 = (await t.call("GET", "/v1/messages?limit=3")).body;
    const p2 = (await t.call("GET", `/v1/messages?limit=3&cursor=${p1.next_cursor}`)).body;
    expect(p1.data).toHaveLength(3);
    expect(p2.data).toHaveLength(2);
    expect(p2.next_cursor).toBeNull();
  });

  it("only shows inboxes an inbox-scoped key can see", async () => {
    const key = await t.makeKey({ scopes: ["read"], inboxIds: [otherInboxId] });
    expect((await t.call("GET", "/v1/messages", { key })).body.data.map((m: any) => m.inbox_id)).toEqual([otherInboxId]);
    expect((await t.call("GET", `/v1/messages?inbox_id=${inboxId}`, { key })).status).toBe(404);
  });
});

describe("usage", () => {
  it("reports plan, inboxes, sends today and sending state", async () => {
    const r = await t.call("GET", "/v1/usage");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      object: "usage",
      plan: "free",
      inboxes: { used: 2, limit: 5 },
      sends_today: { used: 0, limit: 50 },
      sending: { paused: false, reason: null, paused_at: null },
    });
  });
});

describe("stats", () => {
  // A fixed clock: the fixtures are stamped 2026-10-05 (see beforeAll).
  const at = async (path: string): Promise<any> => {
    const app = createApp({ db: t.db, files: { signedGetUrl: async () => "x" }, now: () => new Date("2026-10-06T12:00:00Z"), presetAuth: { orgId: t.orgId, keyId: "key_x", mode: "live", scopes: ["read"], inboxIds: null } });
    return (await app.request(path)).json();
  };

  it("counts mail per UTC day, with empty days as zeros", async () => {
    const r = await at("/v1/stats?days=7");
    expect(r.days.map((d: any) => d.date)).toEqual(["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"]);
    expect(r.days[5]).toMatchObject({ received: 5 });
    expect(r.totals).toEqual({ received: 5, sent: 0, delivered: 0, bounced: 0, failed: 0 });
    expect((await at(`/v1/stats?inbox_id=${otherInboxId}`)).totals.received).toBe(1);
  });
});

describe("threads", () => {
  it("lists threads by most recent activity and returns a thread oldest-first", async () => {
    const list = await t.call("GET", `/v1/inboxes/${inboxId}/threads`);
    expect(list.body.data).toHaveLength(4);
    const thr = list.body.data.at(-1);
    expect(thr).toMatchObject({ object: "thread", subject: "Re: PO #4471 delivery date", message_count: 1 });

    const one = await t.call("GET", `/v1/inboxes/${inboxId}/threads/${thr.id}`);
    expect(one.body.messages.map((m: any) => m.id)).toEqual([ids["gmail-reply.eml"]]);
    expect(one.body.messages[0].html).toBeUndefined();
    const withHtml = await t.call("GET", `/v1/inboxes/${inboxId}/threads/${thr.id}?include_html=true`);
    expect(withHtml.body.messages[0].html).toContain("Thursday");
  });

  it("404s for a thread in another inbox", async () => {
    const otherThread = (await t.call("GET", `/v1/inboxes/${otherInboxId}/threads`)).body.data[0];
    expect((await t.call("GET", `/v1/inboxes/${inboxId}/threads/${otherThread.id}`)).status).toBe(404);
  });
});

describe("access control", () => {
  it("hides messages and threads outside an inbox-scoped key", async () => {
    const key = await t.makeKey({ scopes: ["read"], inboxIds: [otherInboxId] });
    expect((await t.call("GET", `/v1/inboxes/${inboxId}/messages`, { key })).status).toBe(404);
    expect((await t.call("GET", `/v1/inboxes/${inboxId}/threads`, { key })).status).toBe(404);
    expect((await t.call("GET", `/v1/messages/${ids["gmail-reply.eml"]}`, { key })).status).toBe(404);
    expect((await t.call("GET", `/v1/messages/${ids["gmail-reply.eml"]}/raw`, { key })).status).toBe(404);
    expect((await t.call("GET", `/v1/inboxes/${otherInboxId}/messages`, { key })).body.data).toHaveLength(1);
  });

  it("hides another org's messages", async () => {
    const { newId } = await import("@send0/core");
    const { schema } = await import("@send0/db");
    const org = newId("org");
    await t.db.insert(schema.orgs).values({ id: org, name: "Other" });
    const key = await t.makeKey({ orgId: org });
    expect((await t.call("GET", `/v1/messages/${ids["gmail-reply.eml"]}`, { key })).status).toBe(404);
  });
});
