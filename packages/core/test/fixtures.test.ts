import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseInbound } from "../src";

const dir = fileURLToPath(new URL("../../../fixtures/emails/", import.meta.url));
const load = (name: string) => parseInbound(readFileSync(dir + name), { trustedAuthservIds: ["mx.cloudflare.net", "amazonses.com"] });

describe("fixture corpus", () => {
  it("Gmail reply: strips the wrapped quote header and quoted history, keeps threading ids", async () => {
    const m = await load("gmail-reply.eml");
    expect(m.extractedText).toBe("Can you confirm Thursday instead? Our dock is closed Wednesday.\n\nThanks,\nDana");
    expect(m.inReplyTo).toEqual(["<msg_4Tq1aB9cD8eF7gH6@send0.email>"]);
    expect(m.references).toEqual(["<msg_4Tq1aB9cD8eF7gH6@send0.email>"]);
    expect(m.rfcMessageId).toBe("<CAF7xQm2pLr8=Yt@mail.gmail.com>");
    expect(m.subjectNorm).toBe("po #4471 delivery date");
    expect(m.from).toEqual({ name: "Dana Rivera", email: "dana@gmail.com" });
  });

  it("Gmail reply: reads only the topmost trusted Authentication-Results", async () => {
    const m = await load("gmail-reply.eml");
    expect(m.auth).toEqual({ spf: "pass", dkim: "pass", dmarc: "pass", source: "mx.cloudflare.net" });
  });

  it("Outlook reply: decodes Windows-1252, strips the divider block and the mobile signature", async () => {
    const m = await load("outlook-reply.eml");
    expect(m.extractedText).toBe("We’ll pay on the 15th. Our finance team runs payments twice a month.\n\nMorgan");
    expect(m.subject).toBe("RE: Invoice 88213 – payment date");
    expect(m.subjectNorm).toBe("invoice 88213 – payment date");
    expect(m.references).toHaveLength(2);
    expect(m.from?.name).toBe("Lee, Morgan");
    expect(m.extracted.otp).toBeNull();
  });

  it("Apple Mail reply: stops at 'Sent from my iPhone' and the quoted header", async () => {
    const m = await load("apple-mail-reply.eml");
    expect(m.extractedText).toBe("Friday at 2pm works. See you then.");
  });

  it("HTML-only verification email: finds the code and the verify link, drops unsubscribe", async () => {
    const m = await load("otp-html-only.eml");
    expect(m.extracted.otp).toBe("482913");
    expect(m.extracted.actionLink).toBe("https://acme.dev/verify?token=t0k3n&email=signup-agent%40send0.email");
    expect(m.extracted.links.some((l) => l.includes("unsubscribe"))).toBe(false);
    expect(m.text).toContain("Enter this code to verify your email address:");
    expect(m.text).not.toContain("font-size");
  });

  it("code split with a space and also in the subject", async () => {
    const m = await load("otp-subject.eml");
    expect(m.extracted.otp).toBe("731902");
  });

  it("magic link without a code: no false OTP from account or phone numbers", async () => {
    const m = await load("magic-link.eml");
    expect(m.extracted.otp).toBeNull();
    expect(m.extracted.actionLink).toBe("https://acme.dev/auth/magic?token=AbC123xYz");
    expect(m.extracted.links).toEqual(["https://acme.dev/auth/magic?token=AbC123xYz", "https://acme.dev/help"]);
  });

  it("forward: keeps the note the person wrote, not the forwarded message", async () => {
    const m = await load("forwarded.eml");
    expect(m.extractedText).toBe("FYI, can you compare this with last month's quote?");
    expect(m.subjectNorm).toBe("quote for 500 units");
  });

  it("ISO-8859-1 French reply: decodes charset and encoded words, strips 'a écrit :'", async () => {
    const m = await load("iso-8859-1.eml");
    expect(m.subject).toBe("Re\u00a0: Réunion demain"); // =A0 is a non-breaking space
    expect(m.subjectNorm).toBe("réunion demain");
    expect(m.from?.name).toBe("Amélie Durand");
    expect(m.extractedText).toBe("Bonjour, la réunion est déplacée à 15h.");
  });

  it("calendar invite: keeps the text body and exposes the .ics as an attachment", async () => {
    const m = await load("calendar-invite.eml");
    expect(m.extractedText).toContain("You have been invited to Supplier sync");
    const ics = m.attachments.find((a) => a.filename === "invite.ics");
    expect(ics?.size).toBeGreaterThan(50);
    expect(new TextDecoder().decode(ics!.content)).toContain("SUMMARY:Supplier sync");
  });

  it("hidden prompt injection: flagged as likely, with reasons", async () => {
    const m = await load("injection-hidden.eml");
    expect(m.safety.promptInjection).toBe("likely");
    expect(m.safety.reasons).toEqual(expect.arrayContaining(["instruction_override", "exfiltration_request", "hidden_text"]));
    expect(m.auth).toMatchObject({ spf: "neutral", dkim: "none", dmarc: "none" });
  });

  it("attachment with failing auth and a promo code: fail verdicts, no OTP", async () => {
    const m = await load("attachment-pdf.eml");
    expect(m.auth).toMatchObject({ spf: "softfail", dkim: "fail", dmarc: "fail" });
    expect(m.extracted.otp).toBeNull();
    const pdf = m.attachments[0]!;
    expect(pdf).toMatchObject({ filename: "price-list.pdf", contentType: "application/pdf", inline: false });
    expect(new TextDecoder().decode(pdf.content.slice(0, 8))).toBe("%PDF-1.4");
  });

  it("ordinary business mail is not flagged as injection", async () => {
    for (const f of ["gmail-reply.eml", "outlook-reply.eml", "otp-html-only.eml", "magic-link.eml", "calendar-invite.eml"]) {
      expect((await load(f)).safety.promptInjection, f).toBe("none");
    }
  });
});
