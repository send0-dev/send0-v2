import { checkRecipient, findInboxByAddress, MAX_MESSAGE_BYTES, receiveMessage, type InboundMessage } from "@send0/pipeline";
import { authenticate } from "mailauth";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import type { Readable } from "node:stream";
import { generate } from "selfsigned";
import { SMTPServer, type SMTPServerAddress, type SMTPServerSession } from "smtp-server";
import type { ServerConfig } from "./config";
import { cachingResolver, type DnsResolver } from "./dns-cache";
import type { Services } from "./services";

/** A running inbound listener. */
export interface SmtpServer {
  port: number;
  /** Stops accepting connections and waits for open sessions (cut after CLOSE_TIMEOUT_MS). */
  stop: () => Promise<void>;
}

const MAX_CLIENTS = 100;
const MAX_RECIPIENTS = 50;
const SOCKET_TIMEOUT_MS = 60_000;
const CLOSE_TIMEOUT_MS = 10_000;

const logError = (event: string, err: unknown, extra: Record<string, unknown> = {}) =>
  console.error(JSON.stringify({ event, ...extra, error: String(err) }));

/** An error smtp-server turns into the reply `<code> <message>`. */
function smtpError(code: number, message: string): Error & { responseCode: number } {
  return Object.assign(new Error(message), { responseCode: code });
}

const tempFailure = () => smtpError(451, "4.3.0 Temporary failure, try again later");

/** The configured certificate, or a self-signed one for the MX hostname (senders use STARTTLS opportunistically). */
async function tlsOptions(smtp: ServerConfig["smtp"]): Promise<{ key: string; cert: string }> {
  if (smtp.tlsCert && smtp.tlsKey) {
    const [cert, key] = await Promise.all([readFile(smtp.tlsCert, "utf8"), readFile(smtp.tlsKey, "utf8")]);
    return { key, cert };
  }
  const pems = await generate([{ name: "commonName", value: smtp.hostname }], {
    keySize: 2048,
    algorithm: "sha256",
    notAfterDate: new Date(Date.now() + 5 * 365 * 24 * 3600_000),
    extensions: [{ name: "subjectAltName", altNames: [{ type: 2, value: smtp.hostname }] }],
  });
  return { key: pems.private, cert: pems.cert };
}

/** Reads DATA, keeping at most `limit` bytes; the rest is drained so the session stays in sync. */
function collect(stream: Readable & { sizeExceeded?: boolean }, limit: number): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
    });
    stream.once("error", reject);
    stream.once("end", () => resolve(size > limit || stream.sizeExceeded ? null : Buffer.concat(chunks)));
  });
}

/**
 * mailauth's header block, with Authentication-Results first (RFC 8601 section 5): the parser trusts
 * only the topmost header from our authserv-id, so a forged copy further down is ignored.
 */
function authHeaders(headers: string): string {
  const fields = headers.split(/\r?\n(?=\S)/).filter((f) => f.trim());
  const isAr = (f: string) => /^authentication-results:/i.test(f);
  return [...fields.filter(isAr), ...fields.filter((f) => !isAr(f))].map((f) => f.replace(/\r?\n$/, "") + "\r\n").join("");
}

/**
 * Starts the inbound MX: refuses unknown or foreign recipients at RCPT (so senders bounce the mail
 * themselves), checks SPF/DKIM/DMARC/ARC with mailauth, prepends the results and hands each
 * recipient's copy to the same pipeline the hosted Worker uses. A storage or database failure
 * answers 451, so the sender retries; ingestion is idempotent.
 * `resolver` and `maxMessageBytes` are for tests; production uses a cached system resolver and 25 MiB.
 */
export async function startSmtpServer(
  services: Services,
  config: ServerConfig,
  opts: { resolver?: DnsResolver; maxMessageBytes?: number } = {},
): Promise<SmtpServer> {
  const { hostname } = config.smtp;
  const resolver = opts.resolver ?? cachingResolver();
  const limit = Math.min(opts.maxMessageBytes ?? MAX_MESSAGE_BYTES, MAX_MESSAGE_BYTES);
  const inbound = { mailDomains: config.mailDomains, trustedAuthservIds: config.trustedAuthservIds };

  /** Refuses with the same codes the hosted pipeline uses, looking the inbox up last. */
  async function checkRcpt(address: string): Promise<void> {
    const check = checkRecipient(address, config.mailDomains);
    if (!check.ok) throw smtpError(550, check.smtp);
    let inbox;
    try {
      inbox = await findInboxByAddress(services.db, check.recipient.localPart, check.recipient.domain);
    } catch (err) {
      logError("smtp.lookup_failed", err, { to: address });
      throw tempFailure();
    }
    if (!inbox) throw smtpError(550, "5.1.1 Mailbox does not exist");
    if (inbox.status !== "active") throw smtpError(550, "5.2.1 Mailbox disabled");
  }

  /** Prepends our Authentication-Results. If mailauth itself fails, a temperror header still shadows forged ones. */
  async function withAuthResults(raw: Buffer, session: SMTPServerSession, sender: string): Promise<Buffer> {
    let headers: string;
    try {
      const result = await authenticate(raw, {
        ip: session.remoteAddress,
        helo: session.hostNameAppearsAs,
        sender,
        mta: hostname,
        resolver,
        disableBimi: true,
      });
      headers = authHeaders(result.headers);
    } catch (err) {
      logError("smtp.auth_failed", err);
      headers = `Authentication-Results: ${hostname}; spf=temperror; dkim=temperror; dmarc=temperror\r\n`;
    }
    return Buffer.concat([Buffer.from(headers), raw]);
  }

  async function deliver(raw: Buffer, session: SMTPServerSession): Promise<void> {
    const from = session.envelope.mailFrom ? session.envelope.mailFrom.address : "";
    const authed = await withAuthResults(raw, session, from);
    const rejections: string[] = [];
    let accepted = 0;
    for (const rcpt of session.envelope.rcptTo) {
      let rejected: string | undefined;
      const message: InboundMessage = {
        from,
        to: rcpt.address,
        raw: new Blob([new Uint8Array(authed)]).stream(),
        rawSize: authed.byteLength,
        setReject: (reason) => void (rejected = reason),
      };
      try {
        await receiveMessage(message, inbound, { db: services.db, blobs: services.blobs.store, publish: services.publish });
      } catch (err) {
        logError("smtp.ingest_failed", err, { to: rcpt.address, from });
        throw tempFailure();
      }
      if (rejected) rejections.push(rejected);
      else accepted++;
    }
    // Recipients were checked at RCPT, so a refusal here means the inbox changed mid-session.
    if (!accepted && rejections[0]) throw smtpError(rejections[0].startsWith("5.3.4") ? 552 : 550, rejections[0]);
  }

  const server = new SMTPServer({
    name: hostname,
    banner: "send0 ESMTP",
    secure: false,
    ...(await tlsOptions(config.smtp)),
    authOptional: true,
    disabledCommands: ["AUTH"],
    size: limit,
    maxClients: MAX_CLIENTS,
    socketTimeout: SOCKET_TIMEOUT_MS,
    closeTimeout: CLOSE_TIMEOUT_MS,
    logger: false,
    onRcptTo(address: SMTPServerAddress, session, callback) {
      if (session.envelope.rcptTo.length >= MAX_RECIPIENTS) return callback(smtpError(452, "4.5.3 Too many recipients"));
      checkRcpt(address.address).then(
        () => callback(),
        (err: Error) => callback(err),
      );
    },
    onData(stream, session, callback) {
      collect(stream, limit)
        .then((raw) => {
          if (!raw) throw smtpError(552, "5.3.4 Message too big");
          return deliver(raw, session);
        })
        .then(
          () => callback(),
          (err: Error & { responseCode?: number }) => {
            if (!err.responseCode) logError("smtp.data_failed", err);
            callback(err.responseCode ? err : tempFailure());
          },
        );
    },
  });
  // Connection-level errors (resets, TLS handshakes gone wrong) must never crash the process.
  server.on("error", (err) => logError("smtp.connection_error", err));

  await new Promise<void>((resolve, reject) => {
    server.server.once("error", reject);
    server.listen(config.smtp.port, () => (server.server.off("error", reject), resolve()));
  });
  const { port } = server.server.address() as AddressInfo;

  let stopping: Promise<void> | undefined;
  const stop = () => (stopping ??= new Promise<void>((resolve) => server.close(() => resolve())));
  return { port, stop };
}
