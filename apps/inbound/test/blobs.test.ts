import { describe, expect, it } from "vitest";
import { blobStoreFromEnv } from "../src/blobs";

describe("blobStoreFromEnv", () => {
  it("defaults to S3 and refuses a half-configured Worker", () => {
    expect(() => blobStoreFromEnv({ S3_BUCKET: "b", S3_REGION: "ap-south-1" })).toThrow(
      "BLOB_DRIVER=s3 but missing: S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY",
    );
    expect(blobStoreFromEnv({ S3_BUCKET: "b", S3_REGION: "r", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s" }).constructor.name).toBe(
      "S3BlobStore",
    );
  });

  it("uses R2 when asked and the binding exists", () => {
    expect(() => blobStoreFromEnv({ BLOB_DRIVER: "r2" })).toThrow(/RAW_MAIL binding is missing/);
    expect(blobStoreFromEnv({ BLOB_DRIVER: "r2", RAW_MAIL: {} as R2Bucket }).constructor.name).toBe("R2BlobStore");
  });
});
