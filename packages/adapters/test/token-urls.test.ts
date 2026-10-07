import { describe, expect, it } from "vitest";
import { TokenUrlSigner } from "../src/blob";

const secret = "s".repeat(40);
const mk = (baseUrl = "https://api.test") => new TokenUrlSigner({ secret, baseUrl });
const tokenOf = (url: string) => url.split("/v1/files/")[1]!;

describe("TokenUrlSigner", () => {
  it("rejects short secrets", () => {
    expect(() => new TokenUrlSigner({ secret: "short", baseUrl: "https://x" })).toThrow();
  });

  it("round-trips key, filename and content type", async () => {
    const s = mk();
    const url = await s.signedGetUrl("att/a/b.pdf", { expiresIn: 60, filename: "ré sumé.pdf", contentType: "application/pdf" });
    expect(url.startsWith("https://api.test/v1/files/")).toBe(true);
    expect(await s.verify(tokenOf(url))).toEqual({ key: "att/a/b.pdf", filename: "ré sumé.pdf", contentType: "application/pdf" });
  });

  it("returns null filename and content type when absent", async () => {
    const s = mk();
    expect(await s.verify(tokenOf(await s.signedGetUrl("k", { expiresIn: 60 })))).toEqual({ key: "k", filename: null, contentType: null });
  });

  it("strips a trailing slash from baseUrl", async () => {
    expect(await mk("https://api.test/").signedGetUrl("k", { expiresIn: 60 })).toMatch(/^https:\/\/api\.test\/v1\/files\/[^/]+$/);
  });

  it("expires", async () => {
    const s = mk();
    const t = tokenOf(await s.signedGetUrl("k", { expiresIn: 60 }));
    expect(await s.verify(t, new Date(Date.now() + 30_000))).not.toBeNull();
    expect(await s.verify(t, new Date(Date.now() + 61_000))).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const s = mk();
    const [, sig] = tokenOf(await s.signedGetUrl("k", { expiresIn: 60 })).split(".");
    const [body] = tokenOf(await s.signedGetUrl("other", { expiresIn: 60 })).split(".");
    expect(await s.verify(`${body}.${sig}`)).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const s = mk();
    const t = tokenOf(await s.signedGetUrl("k", { expiresIn: 60 }));
    const bad = t.slice(0, -2) + (t.endsWith("AA") ? "BB" : "AA");
    expect(await s.verify(bad)).toBeNull();
  });

  it("rejects another secret", async () => {
    const t = tokenOf(await mk().signedGetUrl("k", { expiresIn: 60 }));
    expect(await new TokenUrlSigner({ secret: "x".repeat(40), baseUrl: "https://api.test" }).verify(t)).toBeNull();
  });

  it("rejects garbage", async () => {
    const s = mk();
    for (const g of ["", ".", "abc", "a.b.c", "!!!.???", "e30.e30"]) expect(await s.verify(g)).toBeNull();
  });
});
