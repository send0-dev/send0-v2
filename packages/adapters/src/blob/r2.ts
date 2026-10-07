import type { BlobReader, BlobStore, PutOptions, StoredBlob } from "./types";

/** Blob store on an R2 bucket binding (Workers). */
export class R2BlobStore implements BlobStore, BlobReader {
  constructor(private readonly bucket: Pick<R2Bucket, "put" | "get" | "delete">) {}

  async put(key: string, body: Uint8Array<ArrayBuffer>, opts: PutOptions): Promise<void> {
    await this.bucket.put(key, body, {
      httpMetadata: { contentType: opts.contentType },
      customMetadata: opts.metadata,
    });
  }

  /** R2 deletes up to 1,000 keys per call; missing keys are ignored. */
  async delete(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += 1000) await this.bucket.delete(keys.slice(i, i + 1000));
  }

  async get(key: string): Promise<StoredBlob | null> {
    const obj = await this.bucket.get(key);
    if (!obj) return null;
    return {
      body: obj.body as ReadableStream<Uint8Array>,
      contentType: obj.httpMetadata?.contentType ?? null,
      size: obj.size ?? null,
    };
  }
}
