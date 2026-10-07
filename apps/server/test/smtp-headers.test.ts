import type { AuthenticateResult } from "mailauth";
import { describe, expect, it } from "vitest";
import {
  arcSetCount,
  authResultsHeader,
  claimsAuthservId,
  joinMessage,
  receivedHeader,
  splitMessage,
  verdictsFrom,
} from "../src/smtp-headers";

const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe("splitMessage / joinMessage", () => {
  it("round-trips byte for byte, folding and 8-bit headers included", () => {
    const raw = Uint8Array.from([...bytes("Subject: caf"), 0xc3, 0xa9, ...bytes("\r\nX-Long: a\r\n b\r\n\r\nbody\r\n")]);
    const { fields, body } = splitMessage(raw);
    expect(fields).toHaveLength(2);
    expect(fields[1]).toBe("X-Long: a\r\n b\r\n");
    expect(new TextDecoder().decode(body)).toBe("\r\nbody\r\n");
    expect(joinMessage("", fields, body)).toEqual(raw);
  });

  it("handles bare LF and header-only messages", () => {
    expect(splitMessage(bytes("A: 1\nB: 2\n\nbody")).fields).toEqual(["A: 1\n", "B: 2\n"]);
    expect(splitMessage(bytes("A: 1\r\n")).body).toHaveLength(0);
  });
});

describe("claimsAuthservId", () => {
  it.each([
    ["Authentication-Results: mx.acme.dev; dmarc=pass", true],
    ["authentication-results:mx.acme.dev;spf=pass", true],
    ["Authentication-Results: (comment) relay.mx.acme.dev 1; none", true],
    ['Authentication-Results: "mx.acme.dev"; dkim=pass', true],
    ["ARC-Authentication-Results: i=1; mx.acme.dev;\r\n dkim=pass", true],
    ["Authentication-Results: evilmx.acme.dev; dmarc=pass", false],
    ["Authentication-Results: mx.cloudflare.net; spf=pass", false],
    ["X-Authentication-Results: mx.acme.dev; spf=pass", false],
  ])("%s", (field, ours) => {
    expect(claimsAuthservId(field, "mx.acme.dev")).toBe(ours);
  });
});

describe("verdictsFrom", () => {
  const result = (over: Partial<Record<"spf" | "dmarc" | "arc", string>> & { dkim?: string[] }) =>
    ({
      spf: over.spf ? { status: { result: over.spf } } : false,
      dkim: { results: (over.dkim ?? []).map((r) => ({ status: { result: r } })) },
      dmarc: over.dmarc ? { status: { result: over.dmarc } } : false,
      arc: over.arc ? { status: { result: over.arc } } : false,
    }) as unknown as AuthenticateResult;

  it("reads only result tokens", () => {
    expect(
      verdictsFrom(result({ spf: "softfail", dkim: ["fail", "pass"], dmarc: "pass", arc: "none" }), { dkim: false, arc: false }),
    ).toEqual({
      spf: "softfail",
      dkim: "pass",
      dmarc: "pass",
      arc: "none",
    });
    expect(verdictsFrom(result({ spf: "pass; dmarc=pass", dkim: [] }), { dkim: false, arc: false })).toEqual({
      spf: "permerror",
      dkim: "none",
      dmarc: "none",
    });
    expect(verdictsFrom(result({ spf: "temperr" }), { dkim: false, arc: false }).spf).toBe("temperror");
  });

  it("marks skipped checks permerror", () => {
    expect(verdictsFrom(result({ dkim: ["pass"] }), { dkim: true, arc: true })).toMatchObject({ dkim: "permerror", arc: "permerror" });
  });
});

describe("headers we write", () => {
  it("builds Authentication-Results from tokens only", () => {
    expect(authResultsHeader("mx.acme.dev", { spf: "pass", dkim: "none", dmarc: "fail" })).toBe(
      "Authentication-Results: mx.acme.dev; spf=pass; dkim=none; dmarc=fail\r\n",
    );
  });

  it("keeps the HELO to a sanitised comment in the trace line", () => {
    const at = new Date("2026-10-07T08:00:00Z");
    expect(receivedHeader("mx.acme.dev", { ip: "::ffff:203.0.113.9", helo: 'x;(dkim=pass)"\\\r\n y', secure: true }, at)).toBe(
      "Received: from [203.0.113.9] (helo=xdkim=passy) by mx.acme.dev with ESMTPS; Wed, 07 Oct 2026 08:00:00 +0000\r\n",
    );
    expect(receivedHeader("mx.acme.dev", { ip: "2001:db8::1", helo: ";;", secure: false }, at)).toMatch(
      /^Received: from \[IPv6:2001:db8::1\] by mx\.acme\.dev with ESMTP; /,
    );
  });

  it("counts ARC sets", () => {
    expect(arcSetCount(["ARC-Seal: i=1\r\n", "ARC-Message-Signature: i=1\r\n", "ARC-Seal: i=2\r\n", "DKIM-Signature: x\r\n"])).toBe(2);
  });
});
