import nodemailer, { type Transporter } from "nodemailer";
import { MailerError, type Mailer, type SendRawInput } from "../mailer";

export interface SmtpMailerOptions {
  /** Keep connections open and reuse them across sends (nodemailer pooling). */
  pool?: boolean;
}

interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  requireTLS: boolean;
  auth?: { user: string; pass: string };
}

/** Parses `smtp://user:pass@host:587[?require_tls=true]` or `smtps://…:465`. Never echoes credentials in errors. */
function parseSmtpUrl(url: string): SmtpSettings {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("SMTP_URL is not a valid URL (expected smtp://user:pass@host:587 or smtps://user:pass@host:465)");
  }
  if (u.protocol !== "smtp:" && u.protocol !== "smtps:") throw new Error("SMTP_URL must use the smtp:// or smtps:// scheme");
  if (!u.hostname) throw new Error("SMTP_URL is missing a host");
  if (!u.port) throw new Error("SMTP_URL is missing a port (usually 587 for smtp://, 465 for smtps://)");
  const port = Number(u.port);
  let auth: SmtpSettings["auth"];
  if (u.username || u.password) {
    try {
      auth = { user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password) };
    } catch {
      throw new Error("SMTP_URL credentials are not valid percent-encoding (encode special characters such as @ and / in the password)");
    }
  }
  const settings: SmtpSettings = {
    host: u.hostname,
    port,
    secure: u.protocol === "smtps:",
    requireTLS: u.searchParams.get("require_tls") === "true",
  };
  if (auth) settings.auth = auth;
  return settings;
}

interface SmtpErrorLike {
  code?: string;
  responseCode?: number;
  response?: string;
  message?: string;
}

const NETWORK_CODES = new Set(["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNREFUSED", "ECONNRESET"]);

/** Maps a nodemailer/SMTP failure to a MailerError. The server's reply is used, never our own config, so no credentials leak. */
function toMailerError(err: unknown): MailerError {
  const e = (err ?? {}) as SmtpErrorLike;
  const rc = e.responseCode;
  if (e.code === "EAUTH" || rc === 535) {
    return new MailerError("SMTP relay rejected the login (check the credentials in SMTP_URL)", 502, false, "auth_failed");
  }
  const detail = (e.response ?? e.message ?? "unknown error").slice(0, 300);
  if (typeof rc === "number" && rc >= 400 && rc <= 599) {
    return new MailerError(`SMTP relay rejected the message: ${detail}`, rc, rc < 500, e.code ?? `smtp_${rc}`);
  }
  if (e.code && NETWORK_CODES.has(e.code)) {
    return new MailerError(`SMTP relay unreachable: ${detail}`, 503, true, e.code);
  }
  return new MailerError(`SMTP send failed: ${detail}`, 503, true, e.code);
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
  const head = raw.slice(0, raw.search(/\r?\n\r?\n/) >>> 0 || raw.length);
  const m = /^message-id:[ \t]*((?:<[^>\r\n]*>)|[^\r\n]*)/im.exec(head.replace(/\r?\n[ \t]+/g, " "));
  return m?.[1]?.trim() || undefined;
}

/**
 * Relays mail through any SMTP provider (Postmark, Resend, Mailgun, SES SMTP, Google Workspace) configured by one SMTP_URL.
 * Node-only: never import this from a Workers bundle.
 */
export class SmtpMailer implements Mailer {
  private readonly transporter: Transporter;

  constructor(url: string, opts: SmtpMailerOptions = {}) {
    const { host, port, secure, requireTLS, auth } = parseSmtpUrl(url);
    this.transporter = nodemailer.createTransport({ host, port, secure, requireTLS, auth, pool: opts.pool ?? false });
  }

  /** `tags` are ignored: they are an SES configuration-set concept with no SMTP equivalent. */
  async sendRaw(input: SendRawInput): Promise<{ providerMessageId: string }> {
    try {
      const info = (await this.transporter.sendMail({
        envelope: { from: input.from, to: input.recipients },
        raw: input.raw,
      })) as { response?: string; messageId?: string };
      return { providerMessageId: idFromResponse(info.response) ?? messageIdHeader(input.raw) ?? info.messageId ?? "" };
    } catch (err) {
      throw toMailerError(err);
    }
  }

  /** Connects and authenticates without sending anything; used by `send0 doctor`. */
  async verify(): Promise<void> {
    try {
      await this.transporter.verify();
    } catch (err) {
      throw toMailerError(err);
    }
  }

  /** Closes pooled connections. */
  close(): void {
    this.transporter.close();
  }
}
