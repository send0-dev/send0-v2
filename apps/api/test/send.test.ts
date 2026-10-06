import type { Mailer, SendRawInput } from "@send0/adapters/mailer";
import { MailerError } from "@send0/adapters/mailer";
import { parseInbound } from "@send0/core";
import { schema } from "@send0/db";
import type { EventEnvelope } from "@send0/pipeline";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { handleSesEvent, PAUSE_RULES } from "../src/sending/ses-events";
import { deliver, fixture, setup, type TestEnv } from "./helpers";

const outbox: SendRawInput[] = [];
let mailerFails: MailerError | null = null;
const mailer: Mailer = {
  sendRaw: async (input) => {
    if (mailerFails) throw mailerFails;
    outbox.push(input);
    return { providerMessageId: `ses-${outbox.length}` };
  },
};
const published: EventEnvelope[] = [];
const types = () => published.map((e) => e.type);

let t: TestEnv;
let inboxId: string;
const parsed = async (i = -1) => parseInbound(outbox.at(i)!.raw, { trustedAuthservIds: [] });

beforeAll(async () => {
  t = await setup({ mailer, publish: async (_o, e) => void published.push(e), sesEvents: { token: "tok_" + "x".repeat(40), topicArn: "arn:aws:sns:ap-south-1:1:send0-ses-events" } });
  inboxId = (await t.call("POST", "/v1/inboxes", { body: { name: "procurement-agent", display_name: "Procurement Agent" } })).body.id;
  // Dana emails us first, which is what lets a free, reply-only inbox write back.
  await deliver(t.db, "procurement-agent@send0.email", fixture("gmail-reply.eml"));
});
afterAll(() => t.close());
beforeEach(() => {
  outbox.length = 0;
  published.length = 0;
  mailerFails = null;
});

const send = (body: unknown, key?: string) => t.call("POST", `/v1/inboxes/${inboxId}/messages`, { body, key });
const inbound = async () => (await t.call("GET", `/v1/inboxes/${inboxId}/messages?direction=in&from=dana@gmail.com`)).body.data[0];

describe("policy", () => {
  it("free accounts can only write to people who wrote first", async () => {
    const r = await send({ to: "stranger@example.com", subject: "Hi", text: "Hello" });
    expect(r.status).toBe(403);
    expect(r.body.error).toMatchObject({ code: "recipient_not_allowed", param: "to" });
    expect(r.body.error.message).toContain("stranger@example.com");
    expect(outbox).toHaveLength(0);
  });

  it("requires a body and valid addresses", async () => {
    expect((await send({ to: "dana@gmail.com", subject: "x" })).body.error.param).toBe("text");
    expect((await send({ to: "not-an-email", subject: "x", text: "y" })).status).toBe(400);
  });
});

describe("send", () => {
  it("sends a new message through SES with our Message-ID and records it", async () => {
    const r = await send({ to: { email: "Dana@Gmail.com", name: "Dana" }, subject: "Delivery window", text: "Thursday works.", html: "<p>Thursday works.</p>" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ object: "message", direction: "out", status: "sent", subject: "Delivery window", to: [{ name: "Dana", email: "dana@gmail.com" }] });
    expect(r.body.rfc_message_id).toBe(`<${r.body.id}@send0.email>`);

    expect(outbox[0]).toMatchObject({ from: "procurement-agent@send0.email", recipients: ["dana@gmail.com"], tags: { msg_id: r.body.id, inbox_id: inboxId } });
    const p = await parsed();
    expect(p.rfcMessageId).toBe(r.body.rfc_message_id);
    expect(p.from).toEqual({ name: "Procurement Agent", email: "procurement-agent@send0.email" });
    expect(p.html).toContain("Thursday works.");
    expect(types()).toEqual(["message.sent"]);
    const [u] = await t.db.select().from(schema.usage).where(eq(schema.usage.orgId, t.orgId));
    expect(u!.sent).toBe(1);
  });

  it("replies in the same thread with In-Reply-To and References", async () => {
    const parent = await inbound();
    const r = await t.call("POST", `/v1/messages/${parent.id}/reply`, { body: { text: "Confirmed for Thursday." } });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ thread_id: parent.thread_id, subject: "Re: PO #4471 delivery date", to: [{ email: "dana@gmail.com" }] });
    const p = await parsed();
    expect(p.inReplyTo).toEqual([parent.rfc_message_id]);
    expect(p.references.at(-1)).toBe(parent.rfc_message_id);

    const thread = await t.call("GET", `/v1/inboxes/${inboxId}/threads/${parent.thread_id}`);
    expect(thread.body.messages.map((m: any) => m.direction)).toEqual(["in", "out"]);
  });

  it("threads the recipient's answer back onto our reply", async () => {
    const parent = await inbound();
    const ours = (await t.call("POST", `/v1/messages/${parent.id}/reply`, { body: { text: "Following up." } })).body;
    const answer = new TextEncoder().encode(
      `From: Dana <dana@gmail.com>\r\nTo: procurement-agent@send0.email\r\nSubject: Re: PO #4471 delivery date\r\nMessage-ID: <answer-1@mail.gmail.com>\r\nIn-Reply-To: ${ours.rfc_message_id}\r\nDate: Mon, 5 Oct 2026 12:00:00 +0000\r\n\r\nSee you then.\r\n`,
    );
    const res = await deliver(t.db, "procurement-agent@send0.email", answer);
    expect(res).toMatchObject({ duplicate: false, threadId: parent.thread_id, threadMatchedBy: "in-reply-to" });
  });

  it("forwards with the original quoted, in a new thread", async () => {
    const parent = await inbound();
    const r = await t.call("POST", `/v1/messages/${parent.id}/forward`, { body: { to: "dana@gmail.com", text: "FYI" } });
    expect(r.body.subject).toBe("Fwd: Re: PO #4471 delivery date");
    expect(r.body.thread_id).not.toBe(parent.thread_id);
    const text = (await parsed()).text;
    expect(text.startsWith("FYI\n\n---------- Forwarded message ---------\nFrom: ")).toBe(true);
    expect(text).toContain(`Subject: ${parent.subject}`);
    expect(text).toContain(parent.text.trim());
  });

  it("defaults the sender name from the inbox name", async () => {
    const plain = (await t.call("POST", "/v1/inboxes", { body: { name: "billing-desk" } })).body.id;
    await deliver(t.db, "billing-desk@send0.email", fixture("gmail-reply.eml"));
    await t.call("POST", `/v1/inboxes/${plain}/messages`, { body: { to: "dana@gmail.com", subject: "Invoice", text: "Attached." } });
    expect((await parsed()).from).toEqual({ name: "Billing Desk", email: "billing-desk@send0.email" });
  });

  it("test keys go through every check but never send", async () => {
    const key = await t.makeKey({ scopes: ["send", "read"], mode: "test" });
    const r = await send({ to: "dana@gmail.com", subject: "CI run", text: "ok" }, key);
    expect(r.body.status).toBe("sent");
    expect(outbox).toHaveLength(0);
  });

  it("marks the message failed and reports SES rejections", async () => {
    mailerFails = new MailerError("SES rejected the message: Email address is not verified.", 400, false, "MessageRejected");
    const r = await send({ to: "dana@gmail.com", subject: "x", text: "y" });
    expect(r.status).toBe(502);
    expect(r.body.error.code).toBe("send_failed");
    const failed = (await t.call("GET", `/v1/inboxes/${inboxId}/messages?direction=out&subject=x`)).body.data[0];
    expect(failed.status).toBe("failed");
  });
});

describe("approval", () => {
  let approvalInbox: string;
  beforeAll(async () => {
    approvalInbox = (await t.call("POST", "/v1/inboxes", { body: { name: "careful-agent", send_policy: "approval" } })).body.id;
    await deliver(t.db, "careful-agent@send0.email", fixture("gmail-reply.eml"));
  });

  it("turns sends into drafts that only an admin can approve", async () => {
    const agentKey = await t.makeKey({ scopes: ["read", "send"], inboxIds: [approvalInbox] });
    const r = await t.call("POST", `/v1/inboxes/${approvalInbox}/messages`, { key: agentKey, body: { to: "dana@gmail.com", subject: "Offer", text: "We accept." } });
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ object: "draft", status: "pending", subject: "Offer" });
    expect(outbox).toHaveLength(0);
    expect(types()).toEqual(["draft.created"]);

    expect((await t.call("POST", `/v1/drafts/${r.body.id}/send`, { key: agentKey })).status).toBe(403);
    const sent = await t.call("POST", `/v1/drafts/${r.body.id}/send`);
    expect(sent.status).toBe(201);
    expect(sent.body.status).toBe("sent");
    expect(outbox).toHaveLength(1);
    expect((await t.call("GET", `/v1/drafts/${r.body.id}`)).body.status).toBe("sent");
    expect((await t.call("POST", `/v1/drafts/${r.body.id}/send`)).status).toBe(403);
  });

  it("can reject drafts", async () => {
    const d = (await t.call("POST", `/v1/inboxes/${approvalInbox}/messages`, { body: { to: "dana@gmail.com", subject: "No", text: "x" } })).body;
    expect((await t.call("POST", `/v1/drafts/${d.id}/reject`)).body.status).toBe("rejected");
    expect((await t.call("GET", `/v1/inboxes/${approvalInbox}/drafts?status=rejected`)).body.data.map((x: any) => x.id)).toContain(d.id);
  });
});

describe("SES events", () => {
  const evt = (msgId: string, over: object) => ({ mail: { messageId: "ses-x", tags: { msg_id: [msgId] } }, ...over });
  const sendOne = async (subject = "Status") => (await send({ to: "dana@gmail.com", subject, text: "x" })).body;

  it("records delivery", async () => {
    const m = await sendOne();
    await handleSesEvent({ db: t.db, files: null as never, publish: async (_o, e) => void published.push(e) }, evt(m.id, { eventType: "Delivery", delivery: { recipients: ["dana@gmail.com"] } }) as never);
    expect((await t.call("GET", `/v1/messages/${m.id}`)).body.status).toBe("delivered");
    expect(types()).toContain("message.delivered");
  });

  it("suppresses permanent bounces and complaints, and never downgrades status", async () => {
    const m = await sendOne();
    const deps = { db: t.db, files: null as never, publish: async (_o: string, e: EventEnvelope) => void published.push(e) };
    await handleSesEvent(deps, evt(m.id, { eventType: "Complaint", complaint: { complainedRecipients: [{ emailAddress: "Dana@gmail.com" }] } }) as never);
    await handleSesEvent(deps, evt(m.id, { eventType: "Delivery", delivery: { recipients: ["dana@gmail.com"] } }) as never);
    expect((await t.call("GET", `/v1/messages/${m.id}`)).body.status).toBe("complained");
    const blocked = await send({ to: "dana@gmail.com", subject: "again", text: "x" });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe("recipient_suppressed");
    await t.db.delete(schema.suppressions).where(eq(schema.suppressions.orgId, t.orgId));
  });

  it("pauses sending when complaints cross the threshold", async () => {
    await t.db.update(schema.orgs).set({ dailySendLimit: 1000 }).where(eq(schema.orgs.id, t.orgId));
    const ids: string[] = [];
    for (let i = ids.length; i < PAUSE_RULES.minSent; i++) ids.push((await sendOne(`bulk ${i}`)).id);
    const deps = { db: t.db, files: null as never, publish: async (_o: string, e: EventEnvelope) => void published.push(e) };
    published.length = 0;
    await handleSesEvent(deps, evt(ids[0]!, { eventType: "Complaint", complaint: { complainedRecipients: [{ emailAddress: "dana@gmail.com" }] } }) as never);
    expect(types()).toEqual(["message.complained", "inbox.suspended"]);
    const [org] = await t.db.select().from(schema.orgs).where(eq(schema.orgs.id, t.orgId));
    expect(org!.sendingPausedReason).toMatch(/complaint rate/);
    await t.db.delete(schema.suppressions).where(eq(schema.suppressions.orgId, t.orgId));
    const r = await send({ to: "dana@gmail.com", subject: "x", text: "y" });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("sending_paused");
    await t.db.update(schema.orgs).set({ sendingPausedAt: null, sendingPausedReason: null }).where(eq(schema.orgs.id, t.orgId));
  });

  it("enforces the daily cap", async () => {
    await t.db.update(schema.orgs).set({ dailySendLimit: 1 }).where(eq(schema.orgs.id, t.orgId));
    const r = await send({ to: "dana@gmail.com", subject: "cap", text: "y" });
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe("daily_limit_reached");
    await t.db.update(schema.orgs).set({ dailySendLimit: 1000 }).where(eq(schema.orgs.id, t.orgId));
  });
});

describe("SNS endpoint", () => {
  const url = (token = "tok_" + "x".repeat(40)) => `/internal/ses-events?token=${token}`;
  const post = (body: unknown, token?: string) => t.app.request(url(token), { method: "POST", body: JSON.stringify(body), headers: { "content-type": "text/plain" } });
  const topic = "arn:aws:sns:ap-south-1:1:send0-ses-events";

  it("hides itself without the token and rejects other topics", async () => {
    expect((await post({ Type: "Notification", TopicArn: topic, Message: "{}" }, "wrong")).status).toBe(404);
    expect((await post({ Type: "Notification", TopicArn: "arn:aws:sns:x:1:evil", Message: "{}" })).status).toBe(403);
  });

  it("confirms the subscription only against SNS hosts", async () => {
    const fetchSpy = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchSpy);
    expect((await post({ Type: "SubscriptionConfirmation", TopicArn: topic, Message: "", SubscribeURL: "https://evil.example.com/x" })).status).toBe(400);
    expect((await post({ Type: "SubscriptionConfirmation", TopicArn: topic, Message: "", SubscribeURL: "https://sns.ap-south-1.amazonaws.com/?Action=ConfirmSubscription&Token=t" })).status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("applies notifications", async () => {
    const m = (await send({ to: "dana@gmail.com", subject: "via sns", text: "x" })).body;
    const res = await post({ Type: "Notification", TopicArn: topic, Message: JSON.stringify({ eventType: "Delivery", mail: { messageId: "x", tags: { msg_id: [m.id] } }, delivery: { recipients: ["dana@gmail.com"] } }) });
    expect(await res.json()).toMatchObject({ ok: true, handled: true, status: "delivered" });
  });
});
