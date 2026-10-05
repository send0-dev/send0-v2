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
    await expect(
      new S3BlobStore(cfg).put("raw/x.eml", new Uint8Array(1), { contentType: "message/rfc822" }),
    ).rejects.toThrow(/403 <Error><Code>AccessDenied/);
  });

  it("supports custom endpoints for MinIO and other S3-compatible stores", async () => {
    let url = "";
    vi.stubGlobal("fetch", async (req: Request) => ((url = req.url), new Response(null)));
    await new S3BlobStore({ ...cfg, endpoint: "http://minio:9000/send0/" }).put("a b/c.eml", new Uint8Array(1), { contentType: "x" });
    expect(url).toBe("http://minio:9000/send0/a%20b/c.eml");
  });
});

describe("R2BlobStore", () => {
  it("maps options onto the R2 binding", async () => {
    const put = vi.fn(async () => null);
    await new R2BlobStore({ put } as never).put("k", new Uint8Array(2), { contentType: "message/rfc822", metadata: { a: "b" } });
    expect(put).toHaveBeenCalledWith("k", expect.any(Uint8Array), { httpMetadata: { contentType: "message/rfc822" }, customMetadata: { a: "b" } });
  });
});
