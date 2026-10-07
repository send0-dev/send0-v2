import { schema } from "@send0/db";
import { migrateWithLock } from "@send0/db/migrate";
import { createPgTestDatabase, TEST_DATABASE_URL } from "@send0/db/testing-pg";
import { hubName } from "@send0/pipeline";
import { and, eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadConfig, type ServerConfig } from "../src/config";
import { seedMailDomains } from "../src/domains";
import { startServer } from "../src/server";
import { createServices, type Services } from "../src/services";
import { startSmtpServer, type SmtpServer } from "../src/smtp";
import { until } from "./support";

const MAIL_DOMAIN = "agents.acme.dev";
const MX = "mx.acme.dev";
const SIZE_LIMIT = 64 * 1024;

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`../../../fixtures/emails/${name}`, import.meta.url).href));

/** Every lookup answers "no such domain", so nothing touches the network and mailauth's verdicts are predictable. */
const offlineResolver = async (name: string): Promise<string[]> => {
  throw Object.assign(new Error(`queryTxt ENOTFOUND ${name}`), { code: "ENOTFOUND" });
};

/** A bare SMTP conversation, for what nodemailer hides: STARTTLS internals and DATA without SIZE=. */
function rawClient(port: number) {
  let socket: net.Socket = net.connect(port, "127.0.0.1");
  let buffer = "";
  let lines: string[] = [];
  const replies: string[] = [];
  const decoder = new TextDecoder();
  const onData = (d: Uint8Array) => {
    buffer += decoder.decode(d, { stream: true });
    let i: number;
    while ((i = buffer.indexOf("\r\n")) >= 0) {
      lines.push(buffer.slice(0, i));
      buffer = buffer.slice(i + 2);
      if (/^\d{3} /.test(lines.at(-1)!)) {
        replies.push(lines.join("\n"));
        lines = [];
      }
    }
  };
  socket.on("data", onData);
  const reply = () => until("an SMTP reply", () => replies.shift());
  return {
    reply,
    async command(line: string) {
      socket.write(`${line}\r\n`);
      return reply();
    },
    write: (data: string) => socket.write(data),
    /** Upgrades after a 220 to STARTTLS; returns the server's certificate. */
    async upgrade(servername: string) {
      socket.off("data", onData);
      const secure = tls.connect({ socket, servername, rejectUnauthorized: false });
      await new Promise<void>((resolve, reject) => secure.once("secureConnect", resolve).once("error", reject));
      secure.on("data", onData);
      socket = secure;
      return secure.getPeerCertificate();
    },
    close: () => socket.destroy(),
  };
}

describe.skipIf(!TEST_DATABASE_URL)("inbound SMTP (Postgres)", () => {
  let config: ServerConfig;
  let services: Services;
  let smtp: SmtpServer;
  let drop: () => Promise<void>;
  let tmp: string;
  const buyer = "ibx_smtp_buyer";

  beforeAll(async () => {
    const db = await createPgTestDatabase();
    drop = db.drop;
    tmp = await mkdtemp(path.join(tmpdir(), "send0-smtp-"));
    config = loadConfig({
      DOMAIN: "mail.acme.dev",
      OWNER_EMAIL: "owner@acme.dev",
      MAIL_DOMAIN,
      MX_HOSTNAME: MX,
      SMTP_PORT: "0",
      SECRET_KEY: "x".repeat(48),
      DATABASE_URL: db.url,
      SMTP_URL: "smtp://127.0.0.1:1",
      BLOB_DIR: path.join(tmp, "blobs"),
    });
    await migrateWithLock(config.databaseUrl);
    services = await createServices(config);
    await seedMailDomains(services.db, config.mailDomains, new Date());
    const [domain] = await services.db.select().from(schema.domains).where(eq(schema.domains.name, MAIL_DOMAIN));
    await services.db.insert(schema.orgs).values({ id: "org_smtp", name: "Acme" });
    await services.db.insert(schema.inboxes).values([
      { id: buyer, orgId: "org_smtp", domainId: domain!.id, localPart: "buyer" },
      { id: "ibx_smtp_paused", orgId: "org_smtp", domainId: domain!.id, localPart: "paused", status: "suspended" },
    ]);
    smtp = await startSmtpServer(services, config, { resolver: offlineResolver, maxMessageBytes: SIZE_LIMIT });
  });

  afterAll(async () => {
    await smtp?.stop();
    await services?.close();
    await drop?.();
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  afterEach(() => vi.restoreAllMocks());

  const send = (to: string[], raw: Buffer, opts: { tls?: boolean } = {}) =>
    nodemailer
      .createTransport({
        host: "127.0.0.1",
        port: smtp.port,
        secure: false,
        name: "mail-sor-f41.google.com",
        ...(opts.tls ? { requireTLS: true, tls: { rejectUnauthorized: false } } : { ignoreTLS: true }),
      })
      .sendMail({ envelope: { from: "dana@gmail.com", to }, raw });

  /** The SMTP reply nodemailer got when it gave up, e.g. "550 5.1.1 Mailbox does not exist". */
  const refusal = (p: Promise<unknown>) =>
    p.then(
      () => {
        throw new Error("expected the server to refuse");
      },
      (err: { responseCode?: number; response?: string }) => ({ code: err.responseCode, response: err.response ?? "" }),
    );

  const messagesWithSubject = (subject: string) =>
    services.db
      .select()
      .from(schema.messages)
      .where(and(eq(schema.messages.inboxId, buyer), eq(schema.messages.subject, subject)));

  it("accepts mail for an inbox and stores it under our own Authentication-Results", async () => {
    const info = await send([`buyer@${MAIL_DOMAIN}`], fixture("gmail-reply.eml"));
    expect(info.response).toMatch(/^250 /);
    expect(info.accepted).toEqual([`buyer@${MAIL_DOMAIN}`]);

    const [msg] = await messagesWithSubject("Re: PO #4471 delivery date");
    expect(msg).toMatchObject({ direction: "in", inboxId: buyer });
    // The fixture carries forged-looking mx.cloudflare.net passes; only our header (offline DNS: nothing verifiable) counts.
    expect(msg!.auth).toEqual({ spf: "none", dkim: "none", dmarc: "none", source: MX });

    const raw = await readFile(path.join(tmp, "blobs", msg!.rawKey!), "utf8");
    expect(raw.startsWith(`Authentication-Results: ${MX};`)).toBe(true);
    expect(raw).toContain("Message-ID: <CAF7xQm2pLr8=Yt@mail.gmail.com>");
  });

  it.each([
    [`nobody@${MAIL_DOMAIN}`, /^550 5\.1\.1 Mailbox does not exist/],
    ["someone@example.com", /^550 5\.7\.1 Relaying denied/],
    [`paused@${MAIL_DOMAIN}`, /^550 5\.2\.1 Mailbox disabled/],
    [`postmaster@${MAIL_DOMAIN}`, /^550 5\.1\.1 /],
  ])("refuses %s at RCPT", async (to, reply) => {
    const r = await refusal(send([to], fixture("otp-html-only.eml")));
    expect(r.code).toBe(550);
    expect(r.response).toMatch(reply);
  });

  it("delivers to the valid recipients when others are refused", async () => {
    const info = await send([`buyer@${MAIL_DOMAIN}`, `nobody@${MAIL_DOMAIN}`], fixture("forwarded.eml"));
    expect(info.accepted).toEqual([`buyer@${MAIL_DOMAIN}`]);
    expect(info.rejected).toEqual([`nobody@${MAIL_DOMAIN}`]);
    expect(await messagesWithSubject("Fwd: Quote for 500 units")).toHaveLength(1);
  });

  it("refuses messages over the size limit, whether declared up front or found during DATA", async () => {
    const big = Buffer.concat([fixture("apple-mail-reply.eml"), Buffer.from(`${"x".repeat(76)}\r\n`.repeat(SIZE_LIMIT / 64))]);
    const declared = await refusal(send([`buyer@${MAIL_DOMAIN}`], big));
    expect(declared.code).toBe(552);

    const c = rawClient(smtp.port);
    try {
      expect(await c.reply()).toMatch(new RegExp(`^220 ${MX.replace(/\./g, "\\.")}`));
      expect(await c.command("EHLO client.example")).toMatch(/SIZE 65536/);
      expect(await c.command("MAIL FROM:<dana@gmail.com>")).toMatch(/^250 /);
      expect(await c.command(`RCPT TO:<buyer@${MAIL_DOMAIN}>`)).toMatch(/^250 /);
      expect(await c.command("DATA")).toMatch(/^354 /);
      c.write(big.toString("utf8").replace(/\r?\n/g, "\r\n"));
      expect(await c.command("\r\n.")).toMatch(/^552 5\.3\.4 Message too big/);
    } finally {
      c.close();
    }
  });

  it("asks the sender to retry when storing the message fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(services.blobs.store, "put").mockRejectedValueOnce(new Error("disk full"));
    const r = await refusal(send([`buyer@${MAIL_DOMAIN}`], fixture("calendar-invite.eml")));
    expect(r.code).toBe(451);
    expect(r.response).toMatch(/^451 4\.3\.0 Temporary failure, try again later/);

    // The retry goes through.
    const info = await send([`buyer@${MAIL_DOMAIN}`], fixture("calendar-invite.eml"));
    expect(info.response).toMatch(/^250 /);
  });

  it("offers STARTTLS with a self-signed certificate for the MX hostname", async () => {
    const c = rawClient(smtp.port);
    try {
      await c.reply();
      expect(await c.command("EHLO client.example")).toMatch(/STARTTLS/);
      expect(await c.command("STARTTLS")).toMatch(/^220 /);
      const cert = await c.upgrade(MX);
      expect(cert.subject.CN).toBe(MX);
      expect(await c.command("EHLO client.example")).toMatch(/^250[- ]/);
    } finally {
      c.close();
    }

    const info = await send([`buyer@${MAIL_DOMAIN}`], fixture("iso-8859-1.eml"), { tls: true });
    expect(info.response).toMatch(/^250 /);
  });

  it("publishes received mail to live waiters", async () => {
    const started = Date.now();
    const waited = services.hub.client.wait(buyer, { direction: "in", subject: "Linear login code" }, started, 20_000);
    await until("the wait to reach the hub", () => services.hub.hasHub(hubName.inbox(buyer)));
    await send([`buyer@${MAIL_DOMAIN}`], fixture("otp-subject.eml"));
    const event = await waited;
    expect(event).toMatchObject({ type: "message.received", inbox_id: buyer });
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it("runs as the server's smtp role", async () => {
    const server = await startServer(config, { roles: ["smtp"] });
    try {
      expect(server.smtpPort).toBeGreaterThan(0);
      const c = rawClient(server.smtpPort!);
      expect(await c.reply()).toMatch(new RegExp(`^220 ${MX.replace(/\./g, "\\.")}`));
      c.close();
    } finally {
      await server.stop();
    }
  });
});
