import { S3BlobStore, TokenUrlSigner, type BlobReader, type BlobStore, type SignedUrlStore } from "@send0/adapters/blob";
import { SesMailer, type Mailer } from "@send0/adapters/mailer";
import { FsBlobStore } from "@send0/adapters/node/fs-blob";
import { SmtpMailer } from "@send0/adapters/node/smtp-mailer";
import type { BlobConfig, MailerConfig } from "./config";

/** Where mail is stored, and how download links for it are made and served. */
export interface Blobs {
  store: BlobStore;
  /** Hands out download links: pre-signed (S3) or app-signed (local disk) */
  files: SignedUrlStore;
  /** Serves `GET /v1/files/:token` for app-signed links; unset when the store pre-signs */
  fileServer?: { signer: TokenUrlSigner; reader: BlobReader };
}

/**
 * Local disk signs its own links with SECRET_KEY and the API streams them back; S3 pre-signs.
 * A custom S3_ENDPOINT (MinIO, R2, Backblaze) is addressed path-style: `<endpoint>/<bucket>/<key>`.
 */
export function createBlobs(cfg: BlobConfig, opts: { secretKey: string; publicUrl: string }): Blobs {
  if (cfg.driver === "fs") {
    const store = new FsBlobStore(cfg.dir);
    const signer = new TokenUrlSigner({ secret: opts.secretKey, baseUrl: opts.publicUrl });
    return { store, files: signer, fileServer: { signer, reader: store } };
  }
  const store = new S3BlobStore({
    bucket: cfg.bucket,
    region: cfg.region,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    ...(cfg.endpoint ? { endpoint: `${cfg.endpoint.replace(/\/+$/, "")}/${encodeURIComponent(cfg.bucket)}` } : {}),
  });
  return { store, files: store };
}

/** The outbound transport: any SMTP relay, or SES with its configuration set. */
export function createMailer(cfg: MailerConfig): Mailer & { close?: () => void } {
  if (cfg.kind === "smtp") return new SmtpMailer(cfg.url);
  return new SesMailer({
    region: cfg.region,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    configurationSet: cfg.configurationSet,
  });
}
