import { R2BlobStore, S3BlobStore, type BlobStore } from "@send0/adapters/blob";

export interface BlobEnv {
  /** "s3" (default) or "r2" */
  BLOB_DRIVER?: string;
  S3_BUCKET?: string;
  S3_REGION?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  RAW_MAIL?: R2Bucket;
}

/** Picks the raw-mail store from config. Fails loudly on a half-configured Worker rather than dropping mail. */
export function blobStoreFromEnv(env: BlobEnv): BlobStore {
  const driver = (env.BLOB_DRIVER ?? "s3").toLowerCase();
  if (driver === "r2") {
    if (!env.RAW_MAIL) throw new Error("BLOB_DRIVER=r2 but the RAW_MAIL binding is missing");
    return new R2BlobStore(env.RAW_MAIL);
  }
  if (driver === "s3") {
    const { S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = env;
    const missing = Object.entries({ S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY })
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missing.length) throw new Error(`BLOB_DRIVER=s3 but missing: ${missing.join(", ")}`);
    return new S3BlobStore({
      bucket: S3_BUCKET!,
      region: S3_REGION!,
      accessKeyId: S3_ACCESS_KEY_ID!,
      secretAccessKey: S3_SECRET_ACCESS_KEY!,
    });
  }
  throw new Error(`Unknown BLOB_DRIVER: ${driver}`);
}
