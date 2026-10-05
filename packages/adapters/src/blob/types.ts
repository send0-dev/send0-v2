export interface PutOptions {
  contentType: string;
  /** Small string metadata stored with the object (ASCII keys; values are URI-encoded for S3). */
  metadata?: Record<string, string>;
}

/** Where raw mail and attachments live. Implemented for R2 (Workers binding) and anything S3-compatible. */
export interface BlobStore {
  put(key: string, body: Uint8Array<ArrayBuffer>, opts: PutOptions): Promise<void>;
}
