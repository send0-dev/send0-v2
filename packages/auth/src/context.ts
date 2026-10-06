import type { Mailer } from "@send0/adapters/mailer";
import { buildMime, newId, rfcMessageId } from "@send0/core";
import { schema, type Db } from "@send0/db";
import { lt, sql } from "drizzle-orm";
import { AuthError } from "./errors";

export interface AuthDeps {
  db: Db;
  mailer?: Mailer;
  /** Sender of system email, e.g. { name: "send0", email: "noreply@send0.dev" } */
  from: { name: string; email: string };
  /** Base URL for links in emails, e.g. https://app.send0.dev */
  appUrl: string;
  now?: () => Date;
}

export interface SystemEmail {
  subject: string;
  text: string;
  html: string;
}

/** What every auth service shares: the database, the clock, rate limits and system email. */
export class AuthContext {
  constructor(readonly deps: AuthDeps) {}

  get db(): Db {
    return this.deps.db;
  }

  now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  link(path: string): string {
    return `${this.deps.appUrl}${path}`;
  }

  /** Fixed-window limiter. Throws 429 once `limit` is passed within `windowMs`. */
  async rateLimit(name: string, id: string, limit: number, windowMs: number): Promise<void> {
    const { rateLimits } = schema;
    const now = this.now();
    const window = Math.floor(now.getTime() / windowMs);
    const [row] = await this.db
      .insert(rateLimits)
      .values({ key: `${name}:${id}:${window}`, count: 1, expiresAt: new Date((window + 1) * windowMs) })
      .onConflictDoUpdate({ target: rateLimits.key, set: { count: sql`${rateLimits.count} + 1` } })
      .returning({ count: rateLimits.count });
    if (row && row.count > limit) {
      throw new AuthError(429, "rate_limited", "Too many attempts. Wait a few minutes and try again.");
    }
    // Opportunistic cleanup of old windows.
    if (Math.random() < 0.02) await this.db.delete(rateLimits).where(lt(rateLimits.expiresAt, now));
  }

  /** Sends account email (verification, resets, invites) from the system address. */
  async sendEmail(to: string, mail: SystemEmail): Promise<void> {
    const { mailer, from } = this.deps;
    if (!mailer) {
      console.log(JSON.stringify({ event: "auth.email_skipped", to, subject: mail.subject }));
      return;
    }
    const id = newId("msg");
    await mailer.sendRaw({
      from: from.email,
      recipients: [to],
      raw: buildMime({
        from,
        to: [{ email: to }],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        messageId: rfcMessageId(id, from.email.split("@")[1]!),
        date: this.now(),
      }),
      tags: { kind: "system" },
    });
  }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const normalizeEmail = (e: string) => e.trim().toLowerCase();
