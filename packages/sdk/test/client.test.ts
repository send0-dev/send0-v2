import { afterEach, describe, expect, it, vi } from "vitest";
import { Send0, Send0Error, verifyWebhook } from "../src";
import { parseSse } from "../src/sse";

function mockFetch(responses: (Response | (() => Response) | Error)[]) {
  const calls: Request[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push(new Request(url, init));
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next() : next;
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

afterEach(() => vi.useRealTimers());

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("client basics", () => {
  it("authenticates and hits the right URL", async () => {
    const m = mockFetch([json({ object: "inbox", id: "ibx_1" })]);
    const s = new Send0({ apiKey: "s0_test_x", baseUrl: "https://api.example/", fetch: m.fetch });
    await s.inboxes.get("ibx_1");
    expect(m.calls[0]!.url).toBe("https://api.example/v1/inboxes/ibx_1");
    expect(m.calls[0]!.headers.get("authorization")).toBe("Bearer s0_test_x");
    expect(m.calls[0]!.headers.get("user-agent")).toMatch(/^send0-sdk-js\//);
  });

  it("sends no Authorization header with apiKey: null (cookie-authenticated proxies)", async () => {
    const m = mockFetch([json({ object: "usage" })]);
    await new Send0({ apiKey: null, baseUrl: "https://app.example/api", fetch: m.fetch }).usage.get();
    expect(m.calls[0]!.url).toBe("https://app.example/api/v1/usage");
    expect(m.calls[0]!.headers.get("authorization")).toBeNull();
  });

  it("covers org-wide lists and draft edits", async () => {
    const m = mockFetch([
      json({ data: [], next_cursor: null }),
      json({ data: [], next_cursor: null }),
      json({ object: "draft", id: "drf_1" }),
    ]);
    const s = new Send0({ apiKey: "k", baseUrl: "https://api.example", fetch: m.fetch });
    await s.messages.listAll({ inbox_id: "ibx_1", status: "bounced" });
    await s.drafts.listAll({ status: "pending" });
    await s.drafts.update("drf_1", { text: "edited" });
    expect(m.calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET https://api.example/v1/messages?inbox_id=ibx_1&status=bounced",
      "GET https://api.example/v1/drafts?status=pending",
      "PATCH https://api.example/v1/drafts/drf_1",
    ]);
    expect(await m.calls[2]!.json()).toEqual({ text: "edited" });
  });

  it("uses a caller's idempotency key for sends, and passes an abort signal to wait", async () => {
    const m = mockFetch([json({ object: "message", id: "msg_1" }, 201)]);
    const s = new Send0({ apiKey: "k", fetch: m.fetch, maxRetries: 0 });
    await s.messages.reply("msg_0", { text: "hi" }, { idempotencyKey: "reply-123" });
    expect(m.calls[0]!.headers.get("idempotency-key")).toBe("reply-123");

    // A long-poll that hangs until it's aborted.
    const hang: typeof fetch = (_url, init) =>
      new Promise((_res, rej) => init!.signal!.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError"))));
    const controller = new AbortController();
    const waiting = new Send0({ apiKey: "k", fetch: hang, maxRetries: 0 }).inboxes.wait(
      "ibx_1",
      { timeout: 60 },
      { signal: controller.signal },
    );
    controller.abort();
    await expect(waiting).rejects.toBeDefined();
  });

  it("needs an API key", () => {
    expect(() => new Send0({ fetch: fetch })).toThrow(/Missing API key/);
  });

  it("maps API errors to Send0Error", async () => {
    const m = mockFetch([json({ error: { code: "recipient_not_allowed", message: "nope", param: "to", request_id: "r1" } }, 403)]);
    const e = await new Send0({ apiKey: "k", fetch: m.fetch }).messages
      .send("ibx_1", { to: "a@b.co", subject: "s", text: "t" })
      .catch((x) => x);
    expect(e).toBeInstanceOf(Send0Error);
    expect(e).toMatchObject({ status: 403, code: "recipient_not_allowed", param: "to", requestId: "r1", message: "nope" });
  });
});

describe("retries", () => {
  it("retries 5xx and network errors with the same Idempotency-Key", async () => {
    const m = mockFetch([new Error("ECONNRESET"), json({}, 503), json({ object: "inbox", id: "ibx_1" }, 201)]);
    const s = new Send0({ apiKey: "k", fetch: m.fetch, maxRetries: 2 });
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 50 });
    const inbox = await s.inboxes.create({ name: "x" });
    vi.useRealTimers();
    expect(inbox.id).toBe("ibx_1");
    const keys = m.calls.map((c) => c.headers.get("idempotency-key"));
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBeTruthy();
  });

  it("waits out a 429 for Retry-After seconds, then retries", async () => {
    const m = mockFetch([
      json({ error: { code: "rate_limited", message: "Too many requests. Slow down and retry after 2 seconds." } }, 429, {
        "retry-after": "2",
      }),
      json({ object: "list", data: [], next_cursor: null }),
    ]);
    vi.useFakeTimers();
    const done = new Send0({ apiKey: "k", fetch: m.fetch, maxRetries: 1 }).inboxes.list();
    await vi.advanceTimersByTimeAsync(1_900);
    expect(m.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200);
    await expect(done).resolves.toMatchObject({ data: [] });
    expect(m.calls).toHaveLength(2);
  });

  it("surfaces rate_limited once retries run out", async () => {
    const m = mockFetch([json({ error: { code: "rate_limited", message: "Too many requests." } }, 429, { "retry-after": "1" })]);
    await expect(new Send0({ apiKey: "k", fetch: m.fetch, maxRetries: 0 }).inboxes.list()).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
    });
  });

  it("does not retry 4xx", async () => {
    const m = mockFetch([json({ error: { code: "invalid_request", message: "bad" } }, 400)]);
    await expect(new Send0({ apiKey: "k", fetch: m.fetch }).inboxes.create({})).rejects.toMatchObject({ status: 400 });
    expect(m.calls).toHaveLength(1);
  });

  it("gives up after maxRetries", async () => {
    const m = mockFetch([json({}, 500), json({}, 500)]);
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 50 });
    await expect(new Send0({ apiKey: "k", fetch: m.fetch, maxRetries: 1 }).inboxes.list()).rejects.toMatchObject({ status: 500 });
    vi.useRealTimers();
    expect(m.calls).toHaveLength(2);
  });
});

describe("pagination", () => {
  it("iterates every page with for-await", async () => {
    const m = mockFetch([
      json({ object: "list", data: [{ id: 1 }, { id: 2 }], next_cursor: "c1" }),
      json({ object: "list", data: [{ id: 3 }], next_cursor: null }),
    ]);
    const page = await new Send0({ apiKey: "k", fetch: m.fetch }).inboxes.list({ limit: 2 });
    expect(page.hasMore).toBe(true);
    const ids: number[] = [];
    for await (const i of page) ids.push((i as unknown as { id: number }).id);
    expect(ids).toEqual([1, 2, 3]);
    expect(new URL(m.calls[1]!.url).searchParams.get("cursor")).toBe("c1");
    expect(new URL(m.calls[1]!.url).searchParams.get("limit")).toBe("2");
  });
});

describe("wait", () => {
  it("returns the message", async () => {
    const m = mockFetch([json({ object: "wait_result", timed_out: false, message: { id: "msg_1", extracted: { otp: "482913" } } })]);
    const msg = await new Send0({ apiKey: "k", fetch: m.fetch }).inboxes.wait("ibx_1", { from: "*@acme.dev", timeout: 60 });
    expect(msg?.extracted?.otp).toBe("482913");
    const q = new URL(m.calls[0]!.url).searchParams;
    expect(q.get("from")).toBe("*@acme.dev");
    expect(q.get("timeout")).toBe("60");
    expect(q.get("since")).toBeTruthy();
  });

  it("splits waits longer than 120s and keeps the same since", async () => {
    const m = mockFetch([
      json({ object: "wait_result", timed_out: true, message: null }),
      json({ object: "wait_result", timed_out: false, message: { id: "msg_2" } }),
    ]);
    const msg = await new Send0({ apiKey: "k", fetch: m.fetch }).inboxes.wait("ibx_1", { timeout: 200 });
    expect(msg?.id).toBe("msg_2");
    const [a, b] = m.calls.map((c) => new URL(c.url).searchParams);
    expect(a!.get("timeout")).toBe("120");
    expect(b!.get("timeout")).toBe("80");
    expect(b!.get("since")).toBe(a!.get("since"));
  });

  it("returns null on timeout", async () => {
    const m = mockFetch([json({ object: "wait_result", timed_out: true, message: null })]);
    expect(await new Send0({ apiKey: "k", fetch: m.fetch }).inboxes.wait("ibx_1", { timeout: 1 })).toBeNull();
  });
});

describe("raw download", () => {
  it("returns the redirect location without following it", async () => {
    const m = mockFetch([new Response(null, { status: 302, headers: { location: "https://s3.example/raw.eml?sig" } })]);
    expect(await new Send0({ apiKey: "k", fetch: m.fetch }).messages.rawUrl("msg_1")).toBe("https://s3.example/raw.eml?sig");
  });
});

describe("SSE", () => {
  it("parses events across chunk boundaries and skips comments", async () => {
    const chunks = [
      "retry: 3000\n: connected\n\nid: evt_1\nevent: message.received\nda",
      'ta: {"id":"evt_1"}\n\n: ping\n\nid: evt_2\ndata: {"id":"evt_2"}\r\n\r\n',
    ];
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch));
        c.close();
      },
    });
    const got = [];
    for await (const m of parseSse(body)) got.push(m);
    expect(got).toEqual([
      { id: "evt_1", event: "message.received", data: '{"id":"evt_1"}' },
      { id: "evt_2", data: '{"id":"evt_2"}' },
    ]);
  });
});

describe("verifyWebhook", () => {
  it("matches the server's signature (same vector as the server tests, computed with openssl)", async () => {
    const header = "t=1791190000,v1=54ea7b7afa65b8ac6431cbd7018e475660476534c583d4c9b9c1f72cc0a71e1b";
    expect(await verifyWebhook('{"id":"evt_1"}', header, "whsec_test", { now: 1791190010 })).toBe(true);
    expect(await verifyWebhook('{"id":"evt_2"}', header, "whsec_test", { now: 1791190010 })).toBe(false);
    expect(await verifyWebhook('{"id":"evt_1"}', header, "whsec_test", { now: 1791199999 })).toBe(false);
  });
});
