import { Readable } from "node:stream";
import type { ConnectionOptions } from "node:tls";
import nodemailer, { type Transporter } from "nodemailer";
import { MailerError, type Mailer, type SendRawInput } from "../mailer";

export interface SmtpMailerOptions {
  /** Socket timeouts in ms. Defaults: connection 10s, greeting 10s, DNS 10s, socket inactivity 60s. */
  timeouts?: Partial<{ connection: number; greeting: number; socket: number; dns: number }>;
  /** Extra TLS options for the client, e.g. a private CA. Never needed with a public relay. */
  tls?: ConnectionOptions;
}

interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  auth?: { user: string; pass: string };
}

const LOOPBACK = /^(localhost|127(\.\d{1,3}){3}|::1)$/i;

function parseBool(name: string, value: string): boolean {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error(`SMTP_URL option ${name} must be true, false, 1 or 0`);
}

/** Parses `smtp://user:pass@host:587[?require_tls=true|false]` or `smtps://…:465`. Never echoes credentials in errors. */
function parseSmtpUrl(url: string): SmtpSettings {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("SMTP_URL is not a valid URL (expected smtp://user:pass@host:587 or smtps://user:pass@host:465)");
  }
  if (u.protocol !== "smtp:" && u.protocol !== "smtps:") throw new Error("SMTP_URL must use the smtp:// or smtps:// scheme");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host) throw new Error("SMTP_URL is missing a host");
  if (!u.port) throw new Error("SMTP_URL is missing a port (usually 587 for smtp://, 465 for smtps://)");
  const port = Number(u.port);
  if (port === 0) throw new Error("SMTP_URL port must not be 0");
  const secure = u.protocol === "smtps:";
  if (!secure && port === 465) throw new Error("SMTP_URL port 465 uses implicit TLS; use smtps:// instead of smtp://");
  let auth: SmtpSettings["auth"];
  if (u.username || u.password) {
    try {
      auth = { user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password) };
    } catch {
      throw new Error("SMTP_URL credentials are not valid percent-encoding (encode special characters such as @ and / in the password)");
    }
  }
  const explicit = u.searchParams.get("require_tls");
  const requireTLS = explicit !== null ? parseBool("require_tls", explicit) : auth !== undefined && !LOOPBACK.test(host);
  const settings: SmtpSettings = { host, port, secure, requireTLS };
  if (auth) settings.auth = auth;
  return settings;
}

interface SmtpErrorLike {
  code?: string;
  command?: string;
  responseCode?: number;
  response?: string;
}

/** Commands that run before the message body is handed over, so a failure there cannot have delivered anything. */
const PRE_BODY_COMMANDS = /^(CONN|EHLO|HELO|LHLO|STARTTLS|AUTH.*|MAIL FROM|RCPT TO)$/;

const DELIVERY_UNKNOWN = "The SMTP relay connection failed after the message was sent; it may or may not have been delivered.";

/**
 * Maps a nodemailer failure to a MailerError. Retryable only when the message provably was not accepted: a definitive
 * 4xx reply, or a failure before the body was handed over. Network-level messages are fixed text so no host or
 * address details reach logs or API responses; the relay's own reply text is kept only for 4xx/5xx replies.
 */
function toMailerError(err: unknown, bodyStarted: boolean): MailerError {
  const e = (err ?? {}) as SmtpErrorLike;
  const rc = e.responseCode;
  const hasReply = typeof rc === "number" && rc >= 400 && rc <= 599;
  if (e.code === "EAUTH" || rc === 535) {
    const temporary = hasReply && rc < 500;
    return new MailerError(
      "SMTP relay rejected the login (check the credentials in SMTP_URL)",
      temporary ? rc : 502,
      temporary,
      "auth_failed",
    );
  }
  if (hasReply) {
    const detail = (e.response ?? "").slice(0, 300);
    return new MailerError(`SMTP relay rejected the message: ${detail}`, rc, rc < 500, e.code ?? `smtp_${rc}`);
  }
  const network = e.code === "ETIMEDOUT" || e.code === "ESOCKET" || e.code === "ECONNECTION" || e.code === "EDNS" || e.code === "ETLS";
  if (network && !bodyStarted && e.command !== undefined && PRE_BODY_COMMANDS.test(e.command)) {
    return new MailerError(e.code === "ETIMEDOUT" ? "SMTP relay timed out" : "SMTP relay unreachable", 503, true, e.code);
  }
  if (network || e.command === "DATA") return new MailerError(DELIVERY_UNKNOWN, 502, false, "delivery_unknown");
  return new MailerError("SMTP send failed", 502, false, e.code ?? "smtp_error");
}

/** Pulls the relay's own message id out of a 250 reply, e.g. "250 2.0.0 Ok: queued as 4F3A1" or SES's "250 Ok 0100018f-…". */
function idFromResponse(response: string | undefined): string | undefined {
  if (!response) return undefined;
  const queued = /queued as (\S+)/i.exec(response);
  if (queued) return queued[1];
  const ok = /^250[ -](?:\d\.\d\.\d )?Ok[: ]+([A-Za-z0-9][A-Za-z0-9._-]{15,})\s*$/i.exec(response.trim());
  return ok?.[1];
}

function messageIdHeader(raw: string): string | undefined {
  const blank = /\r?\n\r?\n/.exec(raw);
  const head = (blank ? raw.slice(0, blank.index) : raw).replace(/\r?\n[ \t]+/g, " ");
  const value = /^message-id:[ \t]*(.*)$/im.exec(head)?.[1]?.trim();
  return value || undefined;
}

/**
 * Relays mail through any SMTP provider (Postmark, Resend, Mailgun, SES SMTP, Google Workspace) configured by one SMTP_URL.
 * Node-only: never import this from a Workers bundle.
 *
 * - `smtp://` connects in plain text and upgrades with STARTTLS when the server offers it; `smtps://` is implicit TLS
 *   (use it for port 465; `smtp://…:465` is rejected).
 * - When credentials are present and the host is not loopback, STARTTLS is required, so a downgrade attack cannot expose
 *   the password. `?require_tls=false` opts out explicitly; `?require_tls=true` forces it everywhere. Accepts true/1/false/0.
 * - Failures are retryable only if the message provably was not accepted (see `toMailerError`). If the connection dies
 *   after the body was sent, the error is `delivery_unknown` and NOT retryable, to avoid duplicate mail.
 * - If some recipients are rejected while others are accepted, it throws a permanent `recipients_rejected` error.
 */
export class SmtpMailer implements Mailer {
  private readonly transporter: Transporter;

  constructor(url: string, opts: SmtpMailerOptions = {}) {
    const { host, port, secure, requireTLS, auth } = parseSmtpUrl(url);
    const t = opts.timeouts ?? {};
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS,
      auth,
      tls: opts.tls,
      connectionTimeout: t.connection ?? 10_000,
      greetingTimeout: t.greeting ?? 10_000,
      socketTimeout: t.socket ?? 60_000,
      dnsTimeout: t.dns ?? 10_000,
    });
  }

  /** `tags` are ignored: they are an SES configuration-set concept with no SMTP equivalent. */
  async sendRaw(input: SendRawInput): Promise<{ providerMessageId: string }> {
    let bodyStarted = false;
    const body = Buffer.from(input.raw, "utf8");
    const raw = new Readable({
      read() {
        bodyStarted = true;
        this.push(body);
        this.push(null);
      },
    });
    let info: { response?: string; messageId?: string; rejected?: unknown[] };
    try {
      info = await this.transporter.sendMail({ envelope: { from: input.from, to: input.recipients }, raw });
    } catch (err) {
      throw toMailerError(err, bodyStarted);
    }
    const rejected = (info.rejected ?? []).map((r) => (typeof r === "string" ? r : ((r as { address?: string }).address ?? "")));
    if (rejected.length > 0) {
      throw new MailerError(`SMTP relay rejected recipients: ${rejected.join(", ")}`, 422, false, "recipients_rejected");
    }
    return { providerMessageId: idFromResponse(info.response) ?? messageIdHeader(input.raw) ?? info.messageId ?? "unknown" };
  }

  /** Connects and authenticates without sending anything; used by `send0 doctor`. */
  async verify(): Promise<void> {
    try {
      await this.transporter.verify();
    } catch (err) {
      throw toMailerError(err, false);
    }
  }

  /** Closes the transporter. */
  close(): void {
    this.transporter.close();
  }
}
