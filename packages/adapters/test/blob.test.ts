import { afterEach, describe, expect, it, vi } from "vitest";
import { R2BlobStore, S3BlobStore } from "../src/blob";

afterEach(() => vi.unstubAllGlobals());

describe("S3BlobStore", () => {
  const cfg = { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret", region: "ap-south-1", bucket: "send0-raw-mail" };

  it("PUTs to the virtual-hosted URL with SigV4, unsigned payload and encoded metadata", async () => {
    const seen: Request[] = [];
    vi.stubGlobal("fetch", async (req: Request) => {
      seen.push(req);
      return new Response(null, { status: 200 });
    });
    const body = new TextEncoder().encode("raw mail");
    await new S3BlobStore(cfg).put("raw/2026/10/05/msg_1.eml", body, {
      contentType: "message/rfc822",
      metadata: { Inbox: "test@send0.email", envelope_from: "Dana <dana@x.com>" },
    });

    const req = seen[0]!;
    expect(req.method).toBe("PUT");
    expect(req.url).toBe("https://send0-raw-mail.s3.ap-south-1.amazonaws.com/raw/2026/10/05/msg_1.eml");
    expect(req.headers.get("x-amz-content-sha256")).toBe("UNSIGNED-PAYLOAD");
    expect(req.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/ap-south-1\/s3\/aws4_request/);
    expect(req.headers.get("content-type")).toBe("message/rfc822");
    expect(req.headers.get("x-amz-meta-inbox")).toBe("test%40send0.email");
    expect(req.headers.get("x-amz-meta-envelope_from")).toBe("Dana%20%3Cdana%40x.com%3E");
    expect(new TextDecoder().decode(await req.arrayBuffer())).toBe("raw mail");
  });

  it("throws with the S3 error on failure so the caller can fail the delivery", async () => {
    vi.stubGlobal("fetch", async () => new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 }));
    await expect(new S3BlobStore(cfg).put("raw/x.eml", new Uint8Array(1), { contentType: "message/rfc822" })).rejects.toThrow(
      /403 <Error><Code>AccessDenied/,
    );
  });

  it("supports custom endpoints for MinIO and other S3-compatible stores", async () => {
    let url = "";
    vi.stubGlobal("fetch", async (req: Request) => ((url = req.url), new Response(null)));
    await new S3BlobStore({ ...cfg, endpoint: "http://minio:9000/send0/" }).put("a b/c.eml", new Uint8Array(1), { contentType: "x" });
    expect(url).toBe("http://minio:9000/send0/a%20b/c.eml");
  });
});

describe("S3BlobStore.signedGetUrl", () => {
  const cfg = { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret", region: "ap-south-1", bucket: "send0-raw-mail" };
  it("returns a SigV4 query-signed URL with expiry and download name", async () => {
    const u = new URL(
      await new S3BlobStore(cfg).signedGetUrl("att/org_1/msg_1/att_1", {
        expiresIn: 900,
        filename: "price list.pdf",
        contentType: "application/pdf",
      }),
    );
    expect(u.origin + u.pathname).toBe("https://send0-raw-mail.s3.ap-south-1.amazonaws.com/att/org_1/msg_1/att_1");
    expect(u.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(u.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(u.searchParams.get("X-Amz-Credential")).toMatch(/^AKIDEXAMPLE\/\d{8}\/ap-south-1\/s3\/aws4_request$/);
    expect(u.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(u.searchParams.get("response-content-disposition")).toContain("filename*=UTF-8''price%20list.pdf");
    expect(u.searchParams.get("response-content-type")).toBe("application/pdf");
  });
  it("caps expiry at 7 days", async () => {
    const u = new URL(await new S3BlobStore(cfg).signedGetUrl("raw/x.eml", { expiresIn: 10 ** 9 }));
    expect(u.searchParams.get("X-Amz-Expires")).toBe("604800");
  });
});

describe("R2BlobStore", () => {
  it("maps options onto the R2 binding", async () => {
    const put = vi.fn(async () => null);
    await new R2BlobStore({ put } as never).put("k", new Uint8Array(2), { contentType: "message/rfc822", metadata: { a: "b" } });
    expect(put).toHaveBeenCalledWith("k", expect.any(Uint8Array), {
      httpMetadata: { contentType: "message/rfc822" },
      customMetadata: { a: "b" },
    });
  });
});

describe("R2BlobStore.delete", () => {
  it("deletes in chunks of 1,000 keys", async () => {
    const del = vi.fn(async () => {});
    const keys = Array.from({ length: 2001 }, (_, i) => `raw/k${i}`);
    await new R2BlobStore({ delete: del } as never).delete(keys);
    expect(del.mock.calls.map((c: unknown[]) => (c[0] as string[]).length)).toEqual([1000, 1000, 1]);
  });
});

describe("R2BlobStore.get", () => {
  it("returns the body, content type and size", async () => {
    const body = new Response("hi").body!;
    const bucket = {
      put: async () => null,
      get: async (k: string) => (k === "k" ? { body, size: 2, httpMetadata: { contentType: "text/plain" } } : null),
    } as never;
    const got = await new R2BlobStore(bucket).get("k");
    expect(got).toMatchObject({ contentType: "text/plain", size: 2 });
    expect(await new Response(got!.body).text()).toBe("hi");
  });

  it("returns null when the object is missing", async () => {
    expect(await new R2BlobStore({ put: async () => null, get: async () => null } as never).get("nope")).toBeNull();
  });
});
