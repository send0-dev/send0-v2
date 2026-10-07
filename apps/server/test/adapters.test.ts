import { S3BlobStore, TokenUrlSigner } from "@send0/adapters/blob";
import { SesMailer } from "@send0/adapters/mailer";
import { FsBlobStore } from "@send0/adapters/node/fs-blob";
import { SmtpMailer } from "@send0/adapters/node/smtp-mailer";
import { describe, expect, it } from "vitest";
import { createBlobs, createMailer } from "../src/adapters";

const opts = { secretKey: "k".repeat(32), publicUrl: "https://mail.acme.dev" };
const s3 = { driver: "s3", bucket: "mail", region: "us-east-1", accessKeyId: "id", secretAccessKey: "key" } as const;

describe("createBlobs", () => {
  it("signs local-disk links itself and serves them through the API", async () => {
    const b = createBlobs({ driver: "fs", dir: "/tmp/send0-blobs" }, opts);
    expect(b.store).toBeInstanceOf(FsBlobStore);
    expect(b.files).toBeInstanceOf(TokenUrlSigner);
    expect(b.fileServer?.reader).toBe(b.store);
    expect(await b.files.signedGetUrl("raw/x.eml", { expiresIn: 60 })).toMatch(/^https:\/\/mail\.acme\.dev\/v1\/files\//);
  });

  it("lets S3 pre-sign, with no file route", async () => {
    const b = createBlobs(s3, opts);
    expect(b.store).toBeInstanceOf(S3BlobStore);
    expect(b.files).toBe(b.store);
    expect(b.fileServer).toBeUndefined();
    expect(await b.files.signedGetUrl("raw/x.eml", { expiresIn: 60 })).toMatch(
      /^https:\/\/mail\.s3\.us-east-1\.amazonaws\.com\/raw\/x\.eml\?/,
    );
  });

  it("addresses a custom S3 endpoint path-style", async () => {
    const b = createBlobs({ ...s3, endpoint: "http://minio:9000/" }, opts);
    expect(await b.files.signedGetUrl("raw/x.eml", { expiresIn: 60 })).toMatch(/^http:\/\/minio:9000\/mail\/raw\/x\.eml\?/);
  });
});

describe("createMailer", () => {
  it("builds an SMTP relay or SES", () => {
    expect(createMailer({ kind: "smtp", url: "smtp://127.0.0.1:2525" })).toBeInstanceOf(SmtpMailer);
    expect(
      createMailer({ kind: "ses", region: "ap-south-1", accessKeyId: "a", secretAccessKey: "b", configurationSet: "c" }),
    ).toBeInstanceOf(SesMailer);
  });
});
