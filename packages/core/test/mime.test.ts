import { describe, expect, it } from "vitest";
import {
  buildMime,
  buildOperatorForward,
  displayNameFromLocalPart,
  encodeHeaderValue,
  encodeQuotedPrintable,
  forwardSubject,
  parseInbound,
  replyReferences,
  replySubject,
} from "../src";

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
    expect(/^\p{ASCII}*$/u.test(raw)).toBe(true); // 7-bit clean
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

describe("deliverability details", () => {
  it("uses quoted-printable, not base64, for text", () => {
    const raw = buildMime({ ...base, html: "<p>Hi</p>" });
    expect(raw).not.toContain("Content-Transfer-Encoding: base64");
    expect(raw.match(/Content-Transfer-Encoding: quoted-printable/g)).toHaveLength(2);
    expect(raw).toContain("Can you confirm Thursday?");
  });

  it("adds a text part when only html is given, and wraps fragments", async () => {
    const raw = buildMime({ ...base, text: null, html: "<p>Your code is <b>482913</b>.</p>" });
    const p = await parseInbound(raw, { trustedAuthservIds: [] });
    expect(p.text).toContain("Your code is 482913.");
    expect(p.html).toMatch(/^<!DOCTYPE html>/);
  });

  it("encodes QP correctly at the edges", () => {
    expect(encodeQuotedPrintable("a=b")).toBe("a=3Db");
    expect(encodeQuotedPrintable("trailing ")).toBe("trailing=20");
    expect(encodeQuotedPrintable("é")).toBe("=C3=A9");
    const long = encodeQuotedPrintable("é".repeat(60));
    for (const line of long.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(76);
      expect(line).toMatch(/^(=[0-9A-F]{2})*=?$/);
    }
  });

  it("round-trips long, multilingual, multi-line bodies through QP", async () => {
    const text = "Line one with = sign\n" + "très long ".repeat(40) + "\n\nend 👍 ";
    const p = await parseInbound(buildMime({ ...base, text }), { trustedAuthservIds: [] });
    expect(p.text.replace(/\r\n/g, "\n").replace(/\n$/, "")).toBe(text); // the final CRLF ends the part
  });

  it("makes display names from local parts", () => {
    expect(displayNameFromLocalPart("procurement-agent")).toBe("Procurement Agent");
    expect(displayNameFromLocalPart("test")).toBe("Test");
    expect(displayNameFromLocalPart("agent.v2_bot")).toBe("Agent V2 Bot");
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

describe("buildOperatorForward", () => {
  const original = "From: Spammer <x@spam.example>\r\nTo: abuse@agents.acme.com\r\nSubject: Report\r\n\r\nPlease look at msg_123.\r\n";
  const build = (raw: string, envelopeFrom = "reporter@isp.example") =>
    buildOperatorForward({
      from: { name: "send0", email: "noreply@agents.acme.com" },
      to: "ops@acme.com",
      recipient: "abuse@agents.acme.com",
      envelopeFrom,
      raw: new TextEncoder().encode(raw),
      messageId: "<fwd_1@agents.acme.com>",
      date: new Date("2026-10-07T10:00:00Z"),
    });

  it("sends from our own address and attaches the original untouched", async () => {
    const raw = build(original);
    const [head] = raw.split("\r\n\r\n");
    expect(head).toContain('From: "send0" <noreply@agents.acme.com>');
    expect(head).toContain("To: ops@acme.com");
    expect(head).toContain("Subject: [send0] Mail for abuse@agents.acme.com from reporter@isp.example");
    expect(head).toContain("Auto-Submitted: auto-forwarded");
    expect(raw).toContain(
      'Content-Type: message/rfc822\r\nContent-Disposition: attachment; filename="original.eml"\r\nContent-Transfer-Encoding: 7bit\r\n\r\n' +
        original,
    );
    expect(raw.endsWith("--\r\n")).toBe(true);

    const parsed = await parseInbound(new TextEncoder().encode(raw), opts);
    expect(parsed.from?.email).toBe("noreply@agents.acme.com");
    expect(parsed.text).toContain("send0 received this message for abuse@agents.acme.com");
  });

  it("marks 8-bit originals and names bounces", () => {
    const raw = build("Subject: caf\u00e9\r\n\r\nd\u00e9j\u00e0 vu\r\n", "");
    expect(raw).toContain("Content-Transfer-Encoding: 8bit");
    expect(raw).toContain("Subject: [send0] Mail for abuse@agents.acme.com from <>");
  });
});
