import type { SendRawInput } from "@send0/adapters/mailer";
import { hubName, HubState, type HubClient } from "@send0/pipeline";
import { isDraft, Send0, Send0Error, type Event } from "@send0/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deliver, fixture, setup, type TestEnv } from "./helpers";

/** The SDK, pointed at the real app in-process. */
let t: TestEnv;
let send0: Send0;
const outbox: SendRawInput[] = [];
const hubs = new Map<string, HubState>();
const hub = (n: string) => hubs.get(n) ?? hubs.set(n, new HubState()).get(n)!;
const hubClient: HubClient = {
  wait: (inboxId, f, since, timeout) => hub(hubName.inbox(inboxId)).wait(f, since, timeout),
  stream: async (name) => {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const w = writable.getWriter();
    hub(name).subscribe((c) => w.write(new TextEncoder().encode(c)));
    return new Response(readable);
  },
};

beforeAll(async () => {
  t = await setup({
    hub: hubClient,
    queue: { send: async () => {} },
    mailer: { sendRaw: async (i) => (outbox.push(i), { providerMessageId: "ses-1" }) },
  });
  send0 = new Send0({
    apiKey: t.adminKey,
    baseUrl: "https://api.test",
    fetch: ((input: RequestInfo, init?: RequestInit) => t.app.request(input as string, init)) as typeof fetch,
  });
});
afterAll(() => t.close());

describe("SDK against the real API", () => {
  it("runs the agent sign-up flow: inbox → wait for the code → reply", async () => {
    const inbox = await send0.inboxes.create({ name: "signup-agent" });
    expect(inbox.address).toBe("signup-agent@send0.email");

    // The verification email arrives while the agent waits.
    const waiting = send0.inboxes.wait(inbox.id, { from: "*@acme.dev", timeout: 10 });
    setTimeout(async () => {
      const r = await deliver(t.db, "signup-agent@send0.email", fixture("otp-html-only.eml"));
      if (!r.duplicate) hub(hubName.inbox(inbox.id)).notify(r.envelope);
    }, 50);
    const msg = await waiting;
    expect(msg?.extracted?.otp).toBe("482913");
    expect(msg?.extracted?.action_link).toContain("acme.dev/verify");

    // Reply-only: replying to the sender is allowed and threads correctly.
    const reply = await send0.messages.reply(msg!.id, { text: "Thanks, verified." });
    if (isDraft(reply)) throw new Error("unexpected draft");
    expect(reply).toMatchObject({
      direction: "out",
      status: "sent",
      thread_id: msg!.thread_id,
      subject: "Re: Your Acme verification code",
    });

    const thread = await send0.threads.get(inbox.id, msg!.thread_id);
    expect(thread.messages.map((m: { direction: string }) => m.direction)).toEqual(["in", "out"]);
  });

  it("surfaces policy errors as Send0Error", async () => {
    const inbox = (await send0.inboxes.list()).data[0]!;
    const e = await send0.messages
      .send(inbox.id, { to: "stranger@example.com", subject: "Hi", text: "x" })
      .catch((x: unknown) => x as Send0Error);
    expect(e).toBeInstanceOf(Send0Error);
    expect((e as Send0Error).code).toBe("recipient_not_allowed");
  });

  it("paginates and searches", async () => {
    for (const n of ["a", "b", "c"]) await send0.inboxes.create({ name: `page-${n}` });
    const seen = [];
    for await (const i of await send0.inboxes.list({ limit: 2 })) seen.push(i.local_part);
    expect(seen).toHaveLength(4);
    const inbox = seen.includes("signup-agent")
      ? (await send0.inboxes.list({ limit: 100 })).data.find((i: { local_part: string }) => i.local_part === "signup-agent")!
      : null;
    const found = await send0.messages.list(inbox!.id, { q: "verify" });
    expect(found.data.length).toBeGreaterThan(0);
  });

  it("manages webhooks and verifies a real signature", async () => {
    const hook = await send0.webhooks.create({ url: "https://example.com/hook", events: ["message.received"] });
    const body = '{"id":"evt_x"}';
    const { signWebhook } = await import("@send0/core");
    const header = await signWebhook(hook.secret, body, Math.floor(Date.now() / 1000));
    expect(await send0.webhooks.verify(body, header, hook.secret)).toBe(true);
    expect(await send0.webhooks.verify(body, header, "whsec_wrong")).toBe(false);
    await send0.webhooks.delete(hook.id);
  });

  it("streams live events", async () => {
    const inbox = await send0.inboxes.create({ name: "stream-agent" });
    const received: Event[] = [];
    const reading = (async () => {
      for await (const e of send0.events.stream({ inboxId: inbox.id })) {
        received.push(e);
        break; // ends the stream and releases the connection
      }
    })();
    // Deliver once the stream is actually subscribed.
    while (hub(hubName.inbox(inbox.id)).subscriberCount === 0) await new Promise((r) => setTimeout(r, 10));
    const r = await deliver(t.db, "stream-agent@send0.email", fixture("magic-link.eml"));
    if (!r.duplicate) hub(hubName.inbox(inbox.id)).notify(r.envelope);
    await reading;
    expect(received[0]).toMatchObject({ type: "message.received", inbox_id: inbox.id });
  });
});
