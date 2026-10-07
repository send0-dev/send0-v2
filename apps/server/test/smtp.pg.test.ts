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

/** Every name looked up, so tests can see which checks ran. */
const lookups: string[] = [];

/** Every lookup answers "no such domain", so nothing touches the network and mailauth's verdicts are predictable. */
const offlineResolver = async (name: string): Promise<string[]> => {
  lookups.push(name);
  throw Object.assign(new Error(`queryTxt ENOTFOUND ${name}`), { code: "ENOTFOUND" });
};

let mailSeq = 0;
/** A small message with a fresh Message-ID (ingestion dedupes on it), plus any extra header lines on top. */
function makeMail(subject: string, headers: string[] = []): string {
  const id = `<t${++mailSeq}.${Date.now()}@sender.test>`;
  return [
    ...headers,
    "From: Dana <dana@sender.test>",
    `To: buyer@${MAIL_DOMAIN}`,
    `Subject: ${subject}`,
    `Message-ID: ${id}`,
    "",
    "Hello.",
    "",
  ].join("\r\n");
}

/** The first header field of a stored message, unfolded. */
const firstField = (raw: string) => raw.split(/\r?\n(?=\S)/)[0]!.replace(/\r?\n\s+/g, " ");

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
  const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
  const reply = () => until("an SMTP reply", () => replies.shift());
  return {
    reply,
    closed,
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

/** One message over a bare session, so tests control EHLO and MAIL FROM exactly. Returns the reply to the final dot. */
async function rawDeliver(port: number, opts: { ehlo?: string; mailFrom?: string; to?: string; data: string }): Promise<string> {
  const c = rawClient(port);
  try {
    await c.reply();
    expect(await c.command(`EHLO ${opts.ehlo ?? "client.example"}`)).toMatch(/^250[- ]/);
    expect(await c.command(`MAIL FROM:${opts.mailFrom ?? "<dana@sender.test>"}`)).toMatch(/^250 /);
    expect(await c.command(`RCPT TO:<${opts.to ?? `buyer@${MAIL_DOMAIN}`}>`)).toMatch(/^250 /);
    expect(await c.command("DATA")).toMatch(/^354 /);
    c.write(opts.data.endsWith("\r\n") ? opts.data : `${opts.data}\r\n`);
    return await c.command(".");
  } finally {
    c.close();
  }
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
    expect(firstField(raw)).toBe(`Authentication-Results: ${MX}; spf=none; dkim=none; dmarc=none; arc=none`);
    expect(raw).toMatch(
      new RegExp(
        `^Received: from \\[127\\.0\\.0\\.1\\] \\(helo=mail-sor-f41\\.google\\.com\\) by ${MX.replace(/\./g, "\\.")} with ESMTP;`,
        "m",
      ),
    );
    expect(raw).toContain("Message-ID: <CAF7xQm2pLr8=Yt@mail.gmail.com>");
  });

  /** The stored message and raw text for a subject delivered by a test. */
  async function stored(subject: string) {
    const [msg] = await until(`message "${subject}"`, async () => {
      const rows = await messagesWithSubject(subject);
      return rows.length ? rows : undefined;
    });
    return { msg: msg!, raw: await readFile(path.join(tmp, "blobs", msg!.rawKey!), "utf8") };
  }

  it("never lets the HELO name inject verdicts into our header", async () => {
    const reply = await rawDeliver(smtp.port, { ehlo: "a;dkim=pass;dmarc=pass", data: makeMail("helo injection") });
    expect(reply).toMatch(/^250 /);
    const { msg, raw } = await stored("helo injection");
    expect(msg.auth).toEqual({ spf: "none", dkim: "none", dmarc: "none", source: MX });
    expect(firstField(raw)).toBe(`Authentication-Results: ${MX}; spf=none; dkim=none; dmarc=none; arc=none`);
    // The HELO survives only as a sanitised comment in the trace line.
    expect(raw).toMatch(/^Received: from \[127\.0\.0\.1\] \(helo=adkim=passdmarc=pass\) by /m);
  });

  it("never lets a quoted MAIL FROM inject verdicts into our header", async () => {
    const reply = await rawDeliver(smtp.port, { mailFrom: '<"x;dmarc=pass"@evil.test>', data: makeMail("mailfrom injection") });
    expect(reply).toMatch(/^250 /);
    const { msg, raw } = await stored("mailfrom injection");
    expect(msg.auth).toEqual({ spf: "none", dkim: "none", dmarc: "none", source: MX });
    expect(firstField(raw)).not.toContain("evil.test");
  });

  it("strips forged results that claim our authserv-id and keeps everyone else's", async () => {
    const data = makeMail("forged results", [
      `Authentication-Results: ${MX}; dmarc=pass; dkim=pass; spf=pass`,
      `ARC-Authentication-Results: i=1; relay.${MX};`,
      " dkim=pass",
      "Authentication-Results: mx.cloudflare.net; spf=fail",
    ]);
    expect(await rawDeliver(smtp.port, { data })).toMatch(/^250 /);
    const { msg, raw } = await stored("forged results");
    expect(msg.auth).toEqual({ spf: "none", dkim: "none", dmarc: "none", source: MX });
    expect(raw.match(/^Authentication-Results:/gim)).toHaveLength(2);
    expect(raw).not.toMatch(/^ARC-Authentication-Results:/im);
    expect(raw).toContain("Authentication-Results: mx.cloudflare.net; spf=fail");
    expect(raw).not.toContain("dmarc=pass");
  });

  it("records temperror when mailauth itself fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = await startSmtpServer(services, config, {
      resolver: offlineResolver,
      authenticate: () => Promise.reject(new Error("mailauth crashed")),
    });
    try {
      expect(await rawDeliver(failing.port, { data: makeMail("auth crash") })).toMatch(/^250 /);
    } finally {
      await failing.stop();
    }
    const { msg, raw } = await stored("auth crash");
    expect(msg.auth).toEqual({ spf: "temperror", dkim: "temperror", dmarc: "temperror", source: MX });
    expect(firstField(raw)).toBe(`Authentication-Results: ${MX}; spf=temperror; dkim=temperror; dmarc=temperror`);
  });

  it("skips DKIM verification for messages with too many signatures", async () => {
    const sigs = Array.from({ length: 11 }, (_, i) => `DKIM-Signature: v=1; a=rsa-sha256; d=amplify.test; s=sel${i}; h=from; bh=x; b=y`);
    lookups.length = 0;
    expect(await rawDeliver(smtp.port, { data: makeMail("dkim amplification", sigs) })).toMatch(/^250 /);
    const { msg, raw } = await stored("dkim amplification");
    expect(msg.auth).toMatchObject({ dkim: "permerror", source: MX });
    expect(lookups.filter((n) => n.includes("_domainkey"))).toEqual([]);
    expect(raw.match(/^DKIM-Signature:/gim)).toHaveLength(11);
  });

  it("accepts bounces, which have an empty MAIL FROM", async () => {
    expect(await rawDeliver(smtp.port, { mailFrom: "<>", data: makeMail("a bounce") })).toMatch(/^250 /);
    await stored("a bounce");
  });

  it("caps recipients per message at 50", async () => {
    const c = rawClient(smtp.port);
    try {
      await c.reply();
      await c.command("EHLO client.example");
      await c.command("MAIL FROM:<dana@sender.test>");
      for (let i = 0; i < 50; i++) expect(await c.command(`RCPT TO:<buyer+r${i}@${MAIL_DOMAIN}>`)).toMatch(/^250 /);
      expect(await c.command(`RCPT TO:<buyer+r50@${MAIL_DOMAIN}>`)).toMatch(/^452 4\.5\.3 Too many recipients/);
    } finally {
      c.close();
    }
  });

  it("drops a session after 20 refused recipients", async () => {
    const c = rawClient(smtp.port);
    try {
      await c.reply();
      await c.command("EHLO client.example");
      await c.command("MAIL FROM:<dana@sender.test>");
      for (let i = 0; i < 19; i++) expect(await c.command(`RCPT TO:<guess${i}@${MAIL_DOMAIN}>`)).toMatch(/^550 /);
      expect(await c.command(`RCPT TO:<guess19@${MAIL_DOMAIN}>`)).toMatch(/^421 4\.7\.0 Too many invalid recipients/);
      await c.closed;
    } finally {
      c.close();
    }
  });

  it("limits concurrent sessions per IP and the lifetime of each session", async () => {
    const limited = await startSmtpServer(services, config, { resolver: offlineResolver, maxSessionsPerIp: 2, sessionLifetimeMs: 1_000 });
    const clients = [rawClient(limited.port), rawClient(limited.port)];
    try {
      for (const c of clients) expect(await c.reply()).toMatch(/^220 /);
      const third = rawClient(limited.port);
      expect(await third.reply()).toMatch(/^421 4\.7\.0 Too many connections/);
      await third.closed;

      // Sessions are cut off at their lifetime, well before the 60s idle timeout.
      const started = Date.now();
      await Promise.all(clients.map((c) => c.closed));
      expect(Date.now() - started).toBeLessThan(3_000);

      const again = rawClient(limited.port);
      expect(await again.reply()).toMatch(/^220 /);
      again.close();
    } finally {
      for (const c of clients) c.close();
      await limited.stop();
    }
  });

  it("processes a bounded number of messages at once", async () => {
    const serial = await startSmtpServer(services, config, { resolver: offlineResolver, maxConcurrentDeliveries: 1 });
    const store = services.blobs.store;
    const put = store.put.bind(store);
    let active = 0;
    let peak = 0;
    vi.spyOn(store, "put").mockImplementation(async (...args) => {
      peak = Math.max(peak, ++active);
      await new Promise((r) => setTimeout(r, 150));
      active--;
      return put(...args);
    });
    try {
      const replies = await Promise.all([1, 2, 3].map((n) => rawDeliver(serial.port, { data: makeMail(`serial ${n}`) })));
      for (const r of replies) expect(r).toMatch(/^250 /);
      expect(peak).toBe(1);
    } finally {
      await serial.stop();
    }
  });

  it("finishes in-flight deliveries before stopping", async () => {
    const draining = await startSmtpServer(services, config, { resolver: offlineResolver });
    const store = services.blobs.store;
    const put = store.put.bind(store);
    let started!: () => void;
    const putStarted = new Promise<void>((r) => (started = r));
    vi.spyOn(store, "put").mockImplementation(async (...args) => {
      started();
      await new Promise((r) => setTimeout(r, 300));
      return put(...args);
    });
    const delivered = rawDeliver(draining.port, { data: makeMail("in flight at shutdown") });
    await putStarted;
    await draining.stop();
    expect(await delivered).toMatch(/^250 /);
    expect(await messagesWithSubject("in flight at shutdown")).toHaveLength(1);
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
      // 64 KiB below the pipeline's 25 MiB, leaving room for the headers we prepend.
      expect(await c.command("EHLO client.example")).toMatch(/SIZE 26148864/);
      c.close();
    } finally {
      await server.stop();
    }
  });
});
