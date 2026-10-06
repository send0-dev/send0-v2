import { describe, expect, it } from "vitest";
import { buildMime, encodeHeaderValue, forwardSubject, parseInbound, replyReferences, replySubject } from "../src";

const opts = { trustedAuthservIds: [] };
const base = {
  from: { name: "Procurement Agent", email: "procurement-agent@send0.email" },
  to: [{ name: "Dana Rivera", email: "dana@acme.com" }],
  subject: "PO #4471 delivery date",
  text: "Can you confirm Thursday?",
  messageId: "<msg_abc@send0.email>",
  date: new Date("2026-10-05T10:14:03Z"),
};

describe("buildMime", () => {
  it("round-trips through our own parser", async () => {
    const raw = buildMime({
      ...base,
      cc: [{ email: "ops@acme.com" }],
      html: "<p>Can you confirm <b>Thursday</b>?</p>",
      inReplyTo: "<CAF7x@mail.gmail.com>",
      references: ["<root@x>", "<CAF7x@mail.gmail.com>"],
      headers: { "X-Send0-Inbox": "ibx_1" },
    });
    expect(raw).toContain("Message-ID: <msg_abc@send0.email>\r\n");
    expect(raw).toContain("Date: Mon, 05 Oct 2026 10:14:03 +0000\r\n");
    expect(raw).not.toMatch(/[^\r]\n/); // CRLF only

    const p = await parseInbound(raw, opts);
    expect(p.from).toEqual({ name: "Procurement Agent", email: "procurement-agent@send0.email" });
    expect(p.to).toEqual([{ name: "Dana Rivera", email: "dana@acme.com" }]);
    expect(p.cc).toEqual([{ name: null, email: "ops@acme.com" }]);
    expect(p.subject).toBe("PO #4471 delivery date");
    expect(p.rfcMessageId).toBe("<msg_abc@send0.email>");
    expect(p.inReplyTo).toEqual(["<CAF7x@mail.gmail.com>"]);
    expect(p.references).toEqual(["<root@x>", "<CAF7x@mail.gmail.com>"]);
    expect(p.text.trim()).toBe("Can you confirm Thursday?");
    expect(p.html).toContain("<b>Thursday</b>");
  });

  it("encodes non-ASCII subjects, names and bodies", async () => {
    const raw = buildMime({
      ...base,
      from: { name: "Amélie Durand", email: "a@send0.email" },
      subject: "Réunion demain — 会议 " + "très ".repeat(20),
      text: "Bonjour, la réunion est déplacée à 15h. 👍\n" + "x".repeat(300),
    });
    expect(raw.split("\r\n").every((l) => l.length <= 998)).toBe(true);
    expect(/^[\x00-\x7f]*$/.test(raw)).toBe(true); // 7-bit clean
    const p = await parseInbound(raw, opts);
    expect(p.subject).toBe("Réunion demain — 会议 " + "très ".repeat(20));
    expect(p.from?.name).toBe("Amélie Durand");
    expect(p.text).toContain("déplacée à 15h. 👍");
  });

  it("escapes quotes in display names and strips header injection", async () => {
    const raw = buildMime({ ...base, from: { name: 'Bob "the bot"', email: "b@send0.email" }, subject: "Hi\r\nBcc: victim@x.com" });
    expect(raw).not.toMatch(/^Bcc:/m);
    const p = await parseInbound(raw, opts);
    expect(p.from?.name).toBe('Bob "the bot"');
    expect(p.subject).toBe("Hi Bcc: victim@x.com");
  });

  it("refuses to set reserved headers or empty bodies", () => {
    expect(() => buildMime({ ...base, headers: { From: "evil@x.com" } })).toThrow();
    expect(() => buildMime({ ...base, text: null, html: null })).toThrow();
  });

  it("folds long recipient lists", () => {
    const to = Array.from({ length: 12 }, (_, i) => ({ email: `person${i}@example.com` }));
    const raw = buildMime({ ...base, to });
    const toHeader = raw.split("\r\nSubject:")[0]!.split("To: ")[1]!;
    expect(toHeader.split("\r\n").length).toBeGreaterThan(1);
    expect(toHeader.split("\r\n").every((l) => l.length <= 78)).toBe(true);
  });
});

describe("reply helpers", () => {
  it("prefixes subjects once", () => {
    expect(replySubject("Hello")).toBe("Re: Hello");
    expect(replySubject("RE: Hello")).toBe("RE: Hello");
    expect(forwardSubject("Hello")).toBe("Fwd: Hello");
    expect(forwardSubject("Fw: Hello")).toBe("Fw: Hello");
  });
  it("builds References with the parent last, de-duplicated and capped", () => {
    expect(replyReferences(["<a>", "<b>"], "<c>")).toEqual(["<a>", "<b>", "<c>"]);
    expect(replyReferences(["<a>", "<c>"], "<c>")).toEqual(["<a>", "<c>"]);
    const many = Array.from({ length: 30 }, (_, i) => `<${i}>`);
    const refs = replyReferences(many, "<new>");
    expect(refs).toHaveLength(20);
    expect(refs[0]).toBe("<0>");
    expect(refs.at(-1)).toBe("<new>");
  });
  it("keeps encoded words short", () => {
    for (const w of encodeHeaderValue("ü".repeat(100)).split("\r\n ")) expect(w.length).toBeLessThanOrEqual(75);
  });
});
