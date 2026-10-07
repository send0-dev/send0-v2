export interface PutOptions {
  contentType: string;
  /** Small string metadata stored with the object (ASCII keys; values are URI-encoded for S3). */
  metadata?: Record<string, string>;
}

/** Where raw mail and attachments live. Implemented for R2 (Workers binding) and anything S3-compatible. */
export interface BlobStore {
  put(key: string, body: Uint8Array<ArrayBuffer>, opts: PutOptions): Promise<void>;
  /**
   * Removes these keys; a key that doesn't exist is not an error. Optional: stores whose credentials
   * can't delete (hosted S3) leave old blobs to a bucket lifecycle rule instead.
   */
  delete?(keys: string[]): Promise<void>;
}

/** Stores that can hand out time-limited download links (S3 and S3-compatible). */
export interface SignedUrlStore {
  signedGetUrl(key: string, opts: { expiresIn: number; filename?: string | null; contentType?: string }): Promise<string>;
}

export interface StoredBlob {
  body: ReadableStream<Uint8Array>;
  contentType: string | null;
  size: number | null;
}

/** Stores the API can stream files back from (local disk, R2 binding). */
export interface BlobReader {
  get(key: string): Promise<StoredBlob | null>;
}
