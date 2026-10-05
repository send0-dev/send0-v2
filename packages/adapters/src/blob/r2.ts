import type { BlobStore, PutOptions } from "./types";

export class R2BlobStore implements BlobStore {
  constructor(private readonly bucket: Pick<R2Bucket, "put">) {}

  async put(key: string, body: Uint8Array<ArrayBuffer>, opts: PutOptions): Promise<void> {
    await this.bucket.put(key, body, {
      httpMetadata: { contentType: opts.contentType },
      customMetadata: opts.metadata,
    });
  }
}
