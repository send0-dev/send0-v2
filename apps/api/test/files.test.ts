import { TokenUrlSigner, type BlobReader, type StoredBlob } from "@send0/adapters/blob";
import { schema } from "@send0/db";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { deliver, fixture, setup, type TestEnv } from "./helpers";

type ErrBody = { error: { code: string; message: string } };
const secret = "t".repeat(48);
const signer = new TokenUrlSigner({ secret, baseUrl: "https://api.test" });
const path = (url: string) => new URL(url).pathname;

/** In-memory BlobReader. */
function memoryReader(initial: Record<string, { bytes: Uint8Array; contentType?: string | null }> = {}) {
  const items = new Map(Object.entries(initial));
  const reader: BlobReader = {
    async get(key): Promise<StoredBlob | null> {
      const it = items.get(key);
      if (!it) return null;
      return { body: new Response(it.bytes as BodyInit).body!, contentType: it.contentType ?? null, size: it.bytes.byteLength };
    },
  };
  return { items, reader };
}

let t: TestEnv | undefined;
afterEach(async () => {
  await t?.close();
  t = undefined;
});

describe("GET /v1/files/:token", () => {
  it("survives lone surrogates, blocks header injection and bad content types", async () => {
    const { reader } = memoryReader({ a: { bytes: new Uint8Array([1]), contentType: "text/html\r\nSet-Cookie: x" } });
    t = await setup({ fileServer: { signer, reader } });
    const url = await signer.signedGetUrl("a", {
      expiresIn: 60,
      filename: "bad\ud800\r\nSet-Cookie: x=1.txt",
      contentType: "text/html\r\nSet-Cookie: y",
    });
    const res = await t.app.request(path(url));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("content-disposition")).not.toMatch(/[\r\n]/);
    expect(res.headers.get("content-disposition")).toContain("%EF%BF%BD");
  });

  it("streams the file with download headers, without an API key", async () => {
    const { reader } = memoryReader({ "att/a": { bytes: new TextEncoder().encode("PDFDATA"), contentType: "application/octet-stream" } });
    t = await setup({ fileServer: { signer, reader } });
    const url = await signer.signedGetUrl("att/a", { expiresIn: 900, filename: 'Résumé "final".pdf', contentType: "application/pdf" });
    const res = await t.app.request(path(url));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("PDFDATA");
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-length")).toBe("7");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-disposition")).toBe(
      `attachment; filename="R_sum_ _final_.pdf"; filename*=UTF-8''R%C3%A9sum%C3%A9%20%22final%22.pdf`,
    );
  });

  it("falls back to the stored content type, then octet-stream", async () => {
    const { reader } = memoryReader({
      a: { bytes: new Uint8Array([1]), contentType: "image/png" },
      b: { bytes: new Uint8Array([1]) },
    });
    t = await setup({ fileServer: { signer, reader } });
    const a = await t.app.request(path(await signer.signedGetUrl("a", { expiresIn: 60 })));
    expect(a.headers.get("content-type")).toBe("image/png");
    expect(a.headers.get("content-disposition")).toBe("attachment");
    const b = await t.app.request(path(await signer.signedGetUrl("b", { expiresIn: 60 })));
    expect(b.headers.get("content-type")).toBe("application/octet-stream");
  });

  it("rejects an expired link", async () => {
    const { reader } = memoryReader({ a: { bytes: new Uint8Array([1]) } });
    t = await setup({ fileServer: { signer, reader } });
    const url = await signer.signedGetUrl("a", { expiresIn: -10 });
    const res = await t.app.request(path(url));
    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrBody).error).toMatchObject({
      code: "invalid_link",
      message: "This download link is invalid or has expired.",
    });
  });

  it("rejects tampered and garbage tokens", async () => {
    const { reader } = memoryReader({ a: { bytes: new Uint8Array([1]) }, b: { bytes: new Uint8Array([2]) } });
    t = await setup({ fileServer: { signer, reader } });
    const [, sigA] = (await signer.signedGetUrl("a", { expiresIn: 60 })).split("/v1/files/")[1]!.split(".");
    const [bodyB] = (await signer.signedGetUrl("b", { expiresIn: 60 })).split("/v1/files/")[1]!.split(".");
    for (const token of [`${bodyB}.${sigA}`, "garbage", "a.b"]) {
      const res = await t.app.request(`/v1/files/${token}`);
      expect(res.status).toBe(403);
      expect(((await res.json()) as ErrBody).error.code).toBe("invalid_link");
    }
  });

  it("404s when the blob is missing", async () => {
    t = await setup({ fileServer: { signer, reader: memoryReader().reader } });
    const res = await t.app.request(path(await signer.signedGetUrl("gone", { expiresIn: 60 })));
    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrBody).error.code).toBe("not_found");
  });

  it("is a plain route_not_found without a fileServer", async () => {
    t = await setup();
    const res = await t.app.request(path(await signer.signedGetUrl("a", { expiresIn: 60 })));
    expect(res.status).toBe(404);
    expect(((await res.json()) as ErrBody).error.code).toBe("route_not_found");
  });

  it("serves the raw message end to end through the redirect", async () => {
    const eml = fixture("gmail-reply.eml");
    const { items, reader } = memoryReader();
    t = await setup({ files: signer, fileServer: { signer, reader } });
    const inbox = (await t.call("POST", "/v1/inboxes", { body: { name: "files-agent" } })).body;
    const delivered = await deliver(t.db, "files-agent@send0.email", eml);
    const [row] = await t.db.select().from(schema.messages).where(eq(schema.messages.inboxId, inbox.id));
    items.set(row!.rawKey!, { bytes: eml, contentType: "message/rfc822" });
    expect(delivered).toBeTruthy();

    const redirect = await t.app.request(`/v1/messages/${row!.id}/raw`, { headers: { authorization: `Bearer ${t.adminKey}` } });
    expect(redirect.status).toBe(302);
    const location = redirect.headers.get("location")!;
    expect(location).toContain("https://api.test/v1/files/");

    const res = await t.app.request(path(location));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("message/rfc822");
    expect(res.headers.get("content-disposition")).toContain(`${row!.id}.eml`);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array(eml));
  });
});
