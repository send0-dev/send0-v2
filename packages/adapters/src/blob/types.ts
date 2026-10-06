export interface PutOptions {
  contentType: string;
  /** Small string metadata stored with the object (ASCII keys; values are URI-encoded for S3). */
  metadata?: Record<string, string>;
}

/** Where raw mail and attachments live. Implemented for R2 (Workers binding) and anything S3-compatible. */
export interface BlobStore {
  put(key: string, body: Uint8Array<ArrayBuffer>, opts: PutOptions): Promise<void>;
}

/** Stores that can hand out time-limited download links (S3 and S3-compatible). */
export interface SignedUrlStore {
  signedGetUrl(key: string, opts: { expiresIn: number; filename?: string | null; contentType?: string }): Promise<string>;
}
