import { AwsClient } from "aws4fetch";
import type { BlobStore, PutOptions } from "./types";

export interface S3Config {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  /** Override for S3-compatible stores (MinIO, R2's S3 API). Defaults to AWS virtual-hosted style. */
  endpoint?: string;
}

/**
 * S3 over plain fetch with SigV4, so it runs on Workers and Node alike.
 * Payloads are sent as UNSIGNED-PAYLOAD (over TLS), so a 25 MiB message isn't hashed on the Worker's CPU.
 */
export class S3BlobStore implements BlobStore {
  private readonly client: AwsClient;
  private readonly base: string;

  constructor(cfg: S3Config) {
    this.client = new AwsClient({
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      region: cfg.region,
      service: "s3",
      retries: 2,
    });
    this.base = (cfg.endpoint ?? `https://${cfg.bucket}.s3.${cfg.region}.amazonaws.com`).replace(/\/$/, "");
  }

  async put(key: string, body: Uint8Array<ArrayBuffer>, opts: PutOptions): Promise<void> {
    const headers: Record<string, string> = { "content-type": opts.contentType };
    for (const [k, v] of Object.entries(opts.metadata ?? {})) headers[`x-amz-meta-${k.toLowerCase()}`] = encodeURIComponent(v);
    const url = `${this.base}/${key.split("/").map(encodeURIComponent).join("/")}`;
    const res = await this.client.fetch(url, { method: "PUT", headers, body });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new Error(`S3 PUT ${key} failed: ${res.status} ${detail}`);
    }
  }
}
