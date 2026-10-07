import { checkRecipient, findInboxByAddress, MAX_MESSAGE_BYTES, receiveMessage, type InboundMessage } from "@send0/pipeline";
import { authenticate, type AuthenticateOptions, type AuthenticateResult } from "mailauth";
import { readFile } from "node:fs/promises";
import type { AddressInfo, Socket } from "node:net";
import type { Readable } from "node:stream";
import { generate } from "selfsigned";
import { SMTPServer, type SMTPServerAddress, type SMTPServerSession } from "smtp-server";
import { BackgroundTasks } from "./background";
import type { ServerConfig } from "./config";
import { cachingResolver, type DnsResolver } from "./dns-cache";
import { Semaphore } from "./semaphore";
import type { Services } from "./services";
import {
  arcSetCount,
  authResultsHeader,
  claimsAuthservId,
  isArcField,
  isDkimSignature,
  joinMessage,
  receivedHeader,
  splitMessage,
  verdictsFrom,
  type Verdicts,
} from "./smtp-headers";

/** A running inbound listener. */
export interface SmtpServer {
  port: number;
  /** Stops accepting connections, lets in-flight deliveries finish (up to CLOSE_TIMEOUT_MS), then ends every session. */
  stop: () => Promise<void>;
}

/** Tunables; the defaults suit production, tests shrink them. */
export interface SmtpOptions {
  /** DNS for mailauth; defaults to a cached system resolver */
  resolver?: DnsResolver;
  /** The advertised SIZE; defaults to (and is capped at) 64 KiB under the pipeline's limit, leaving room for our headers */
  maxMessageBytes?: number;
  /** Messages authenticated and ingested at once; the rest wait (bounds memory) */
  maxConcurrentDeliveries?: number;
  maxSessionsPerIp?: number;
  /** Hard cap on a session's life, however busy it is */
  sessionLifetimeMs?: number;
  /** mailauth's `authenticate`, swappable so tests can make it fail */
  authenticate?: (input: Buffer, opts: AuthenticateOptions) => Promise<AuthenticateResult>;
}

const MAX_CLIENTS = 100;
const MAX_RECIPIENTS = 50;
/** Refused RCPTs before a session is dropped: stops directory harvesting. */
const MAX_REFUSED_RCPTS = 20;
/** DKIM signatures or ARC sets verified per message; more is an amplification attempt. */
const MAX_SIGNATURES = 10;
const HEADER_HEADROOM = 64 * 1024;
const SOCKET_TIMEOUT_MS = 60_000;
/** Within the server's shutdown budget: runs in parallel with the HTTP drain. */
const CLOSE_TIMEOUT_MS = 10_000;

const logError = (event: string, err: unknown, extra: Record<string, unknown> = {}) =>
  console.error(JSON.stringify({ event, ...extra, error: String(err) }));

/** An error smtp-server turns into the reply `<code> <message>`. */
function smtpError(code: number, message: string): Error & { responseCode: number } {
  return Object.assign(new Error(message), { responseCode: code });
}

/** A Buffer view of the same bytes (mailauth wants a Buffer, string or stream). */
const asBuffer = (bytes: Uint8Array): Buffer => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

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
 * Starts the inbound MX: refuses unknown or foreign recipients at RCPT (so senders bounce the mail
 * themselves), checks SPF/DKIM/DMARC/ARC with mailauth, prepends the results and hands each
 * recipient's copy to the same pipeline the hosted Worker uses. A storage or database failure
 * answers 451, so the sender retries; ingestion is idempotent.
 * Abuse limits: sessions per IP, a hard session lifetime, refused-RCPT and recipient caps, bounded
 * concurrent deliveries, and no more than MAX_SIGNATURES DKIM/ARC verifications per message.
 */
export async function startSmtpServer(services: Services, config: ServerConfig, opts: SmtpOptions = {}): Promise<SmtpServer> {
  const { hostname } = config.smtp;
  const resolver = opts.resolver ?? cachingResolver();
  const verify = opts.authenticate ?? authenticate;
  const limit = Math.min(opts.maxMessageBytes ?? Infinity, MAX_MESSAGE_BYTES - HEADER_HEADROOM);
  const maxSessionsPerIp = opts.maxSessionsPerIp ?? 10;
  const sessionLifetimeMs = opts.sessionLifetimeMs ?? 10 * 60_000;
  const deliveries = new Semaphore(opts.maxConcurrentDeliveries ?? 4);
  const inflight = new BackgroundTasks();
  const inbound = { mailDomains: config.mailDomains, trustedAuthservIds: config.trustedAuthservIds };
  const sessionsPerIp = new Map<string, number>();
  const counted = new Set<string>();
  const refusedRcpts = new Map<string, number>();

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

  /**
   * Checks the message with mailauth and builds our own headers from its structured results only.
   * Over-signed messages skip DKIM/ARC (permerror). If mailauth fails, temperror still shadows forgeries.
   */
  async function verdictsFor(
    raw: Buffer,
    fields: string[],
    body: Uint8Array,
    session: SMTPServerSession,
    sender: string,
  ): Promise<Verdicts> {
    const skipped = { dkim: fields.filter(isDkimSignature).length > MAX_SIGNATURES, arc: arcSetCount(fields) > MAX_SIGNATURES };
    const unverified = (f: string) => (skipped.dkim && isDkimSignature(f)) || (skipped.arc && isArcField(f));
    const input =
      skipped.dkim || skipped.arc
        ? asBuffer(
            joinMessage(
              "",
              fields.filter((f) => !unverified(f)),
              body,
            ),
          )
        : raw;
    try {
      const options: AuthenticateOptions & { maxResolveCount: number; maxVoidCount: number } = {
        ip: session.remoteAddress,
        helo: session.hostNameAppearsAs,
        sender,
        mta: hostname,
        resolver,
        disableBimi: true,
        disableArc: skipped.arc,
        // RFC 7208 section 4.6.4 limits, explicitly: SPF lookups and void lookups per check.
        maxResolveCount: 10,
        maxVoidCount: 2,
      };
      return verdictsFrom(await verify(input, options), skipped);
    } catch (err) {
      logError("smtp.auth_failed", err);
      return { spf: "temperror", dkim: "temperror", dmarc: "temperror" };
    }
  }

  async function deliver(raw: Buffer, session: SMTPServerSession): Promise<void> {
    const from = session.envelope.mailFrom ? session.envelope.mailFrom.address : "";
    const { fields, body } = splitMessage(raw);
    const verdicts = await verdictsFor(raw, fields, body, session, from);
    const ours =
      authResultsHeader(hostname, verdicts) +
      receivedHeader(hostname, { ip: session.remoteAddress, helo: session.hostNameAppearsAs, secure: session.secure }, new Date());
    // Built once; every recipient's stream reads the same bytes.
    const authed = joinMessage(
      ours,
      fields.filter((f) => !claimsAuthservId(f, hostname)),
      body,
    );

    const rejections: string[] = [];
    let accepted = 0;
    for (const rcpt of session.envelope.rcptTo) {
      let rejected: string | undefined;
      const message: InboundMessage = {
        from,
        to: rcpt.address,
        raw: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(authed);
            controller.close();
          },
        }),
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
    // Recipients were checked at RCPT, so a refusal here means the inbox changed mid-session. When others
    // were accepted the reply is still 250 and that recipient's copy is dropped (logged by the pipeline), not bounced.
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
    onConnect(session, callback) {
      const n = sessionsPerIp.get(session.remoteAddress) ?? 0;
      if (n >= maxSessionsPerIp) return callback(smtpError(421, "4.7.0 Too many connections"));
      sessionsPerIp.set(session.remoteAddress, n + 1);
      counted.add(session.id);
      callback();
    },
    onClose(session) {
      refusedRcpts.delete(session.id);
      if (!counted.delete(session.id)) return;
      const n = (sessionsPerIp.get(session.remoteAddress) ?? 1) - 1;
      if (n > 0) sessionsPerIp.set(session.remoteAddress, n);
      else sessionsPerIp.delete(session.remoteAddress);
    },
    onRcptTo(address: SMTPServerAddress, session, callback) {
      if (session.envelope.rcptTo.length >= MAX_RECIPIENTS) return callback(smtpError(452, "4.5.3 Too many recipients"));
      checkRcpt(address.address).then(
        () => callback(),
        (err: Error & { responseCode?: number }) => {
          if ((err.responseCode ?? 0) >= 500) {
            const refused = (refusedRcpts.get(session.id) ?? 0) + 1;
            refusedRcpts.set(session.id, refused);
            // A 421 makes smtp-server close the connection.
            if (refused >= MAX_REFUSED_RCPTS) return callback(smtpError(421, "4.7.0 Too many invalid recipients"));
          }
          callback(err);
        },
      );
    },
    onData(stream, session, callback) {
      const work = collect(stream, limit).then((raw) => {
        if (!raw) throw smtpError(552, "5.3.4 Message too big");
        return deliveries.run(() => deliver(raw, session));
      });
      // Tracked for shutdown; its outcome is handled below.
      inflight.waitUntil(work.catch(() => {}));
      work.then(
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
  // Slow-drip clients can keep resetting the idle timeout; this cuts every session at a fixed age.
  server.server.on("connection", (socket: Socket) => {
    const timer = setTimeout(() => socket.destroy(), sessionLifetimeMs);
    timer.unref();
    socket.once("close", () => clearTimeout(timer));
  });

  await new Promise<void>((resolve, reject) => {
    server.server.once("error", reject);
    server.listen(config.smtp.port, () => (server.server.off("error", reject), resolve()));
  });
  const { port } = server.server.address() as AddressInfo;

  let stopping: Promise<void> | undefined;
  const stop = () =>
    (stopping ??= (async () => {
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      if (!(await inflight.drain(CLOSE_TIMEOUT_MS))) {
        console.error(JSON.stringify({ event: "smtp.shutdown_abandoned", pending: inflight.size }));
      }
      // Idle sessions would otherwise hold shutdown until closeTimeout; a 421 makes the sender retry later.
      for (const c of (server as unknown as { connections: Set<{ send: (code: number, msg: string) => void }> }).connections) {
        c.send(421, "4.3.2 Server shutting down");
      }
      await closed;
    })());
  return { port, stop };
}
