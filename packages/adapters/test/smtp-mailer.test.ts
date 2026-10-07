import type { AddressInfo } from "node:net";
import { SMTPServer, type SMTPServerOptions } from "smtp-server";
import { afterEach, describe, expect, it } from "vitest";
import { MailerError } from "../src/mailer";
import { SmtpMailer } from "../src/node/smtp-mailer";

const RAW = "From: a@send0.email\r\nTo: b@example.com\r\nSubject: Hi\r\nMessage-ID: <msg_1@send0.email>\r\n\r\nHello =\r\n.dot line\r\n";
const USER = "relay-user";
const PASS = "p@ss/w0rd:1";

const servers: SMTPServer[] = [];
const mailers: SmtpMailer[] = [];

async function start(opts: SMTPServerOptions = {}): Promise<number> {
  const server = new SMTPServer({
    secure: false,
    disabledCommands: ["STARTTLS"],
    allowInsecureAuth: true,
    authOptional: true,
    logger: false,
    onAuth(auth, _s, cb) {
      if (auth.username === USER && auth.password === PASS) cb(null, { user: USER });
      else cb(new Error("Invalid login"));
    },
    ...opts,
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  servers.push(server);
  return (server.server.address() as AddressInfo).port;
}

function mailer(url: string): SmtpMailer {
  const m = new SmtpMailer(url);
  mailers.push(m);
  return m;
}

const enc = encodeURIComponent;
const send = (m: SmtpMailer) =>
  m.sendRaw({ from: "a@send0.email", recipients: ["b@example.com", "c@example.com"], raw: RAW, tags: { x: "y" } });

afterEach(async () => {
  mailers.splice(0).forEach((m) => m.close());
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(() => r(undefined)))));
});

describe("SmtpMailer", () => {
  it("delivers the raw bytes and explicit envelope unchanged, with URL-decoded credentials", async () => {
    let data = "";
    let from = "";
    let user = "";
    const rcpt: string[] = [];
    const port = await start({
      authOptional: false,
      onAuth(auth, _s, cb) {
        user = auth.username ?? "";
        cb(auth.password === PASS ? null : new Error("Invalid login"), auth.password === PASS ? { user: USER } : undefined);
      },
      onMailFrom: (a, _s, cb) => ((from = a.address), cb()),
      onRcptTo: (a, _s, cb) => (rcpt.push(a.address), cb()),
      onData(stream, _s, cb) {
        const chunks: Buffer[] = [];
        stream.on("data", (c: Buffer) => chunks.push(c));
        stream.on("end", () => ((data = Buffer.concat(chunks).toString("utf8")), cb()));
      },
    });
    const res = await send(mailer(`smtp://${USER}:${enc(PASS)}@127.0.0.1:${port}`));
    expect(data).toBe(RAW);
    expect(from).toBe("a@send0.email");
    expect(rcpt).toEqual(["b@example.com", "c@example.com"]);
    expect(user).toBe(USER);
    expect(res.providerMessageId).toBe("<msg_1@send0.email>");
  });

  it("prefers the id the relay returns in its 250 reply", async () => {
    const port = await start({
      onData(stream, _s, cb) {
        stream.resume();
        stream.on("end", () => cb(null));
      },
    });
    const res = await send(mailer(`smtp://127.0.0.1:${port}`));
    // smtp-server replies "250 OK: message queued"; no parsable id, so we fall back to the Message-ID header.
    expect(res.providerMessageId).toBe("<msg_1@send0.email>");
  });

  it("treats a 4xx rejection as retryable", async () => {
    const port = await start({ onRcptTo: (_a, _s, cb) => cb(Object.assign(new Error("Mailbox busy, try later"), { responseCode: 451 })) });
    const err = await send(mailer(`smtp://127.0.0.1:${port}`)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailerError);
    expect(err).toMatchObject({ status: 451, retryable: true });
  });

  it("treats a 5xx rejection as permanent", async () => {
    const port = await start({ onRcptTo: (_a, _s, cb) => cb(Object.assign(new Error("No such user"), { responseCode: 550 })) });
    const err = await send(mailer(`smtp://127.0.0.1:${port}`)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailerError);
    expect(err).toMatchObject({ status: 550, retryable: false, code: "EENVELOPE" });
  });

  it("reports wrong credentials as auth_failed without leaking the password", async () => {
    const port = await start({ authOptional: false });
    const err = (await send(mailer(`smtp://${USER}:${enc("wrong-secret-pw")}@127.0.0.1:${port}`)).catch((e: unknown) => e)) as MailerError;
    expect(err).toBeInstanceOf(MailerError);
    expect(err).toMatchObject({ status: 502, retryable: false, code: "auth_failed" });
    expect(err.message).not.toContain("wrong-secret-pw");
  });

  it("treats a refused connection as retryable", async () => {
    const port = await start();
    await new Promise((r) => servers.pop()!.close(() => r(undefined)));
    const err = await send(mailer(`smtp://127.0.0.1:${port}`)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailerError);
    expect(err).toMatchObject({ status: 503, retryable: true });
  });

  it("verify() succeeds with good credentials and fails with auth_failed on bad ones", async () => {
    const port = await start({ authOptional: false });
    await expect(mailer(`smtp://${USER}:${enc(PASS)}@127.0.0.1:${port}`).verify()).resolves.toBeUndefined();
    await expect(mailer(`smtp://${USER}:nope@127.0.0.1:${port}`).verify()).rejects.toMatchObject({ code: "auth_failed", retryable: false });
  });

  it("verify() reports an unreachable relay as retryable", async () => {
    const port = await start();
    await new Promise((r) => servers.pop()!.close(() => r(undefined)));
    await expect(mailer(`smtp://127.0.0.1:${port}`).verify()).rejects.toMatchObject({ status: 503, retryable: true });
  });

  it("requires TLS when ?require_tls=true and the server does not offer STARTTLS", async () => {
    const port = await start();
    const err = await send(mailer(`smtp://127.0.0.1:${port}?require_tls=true`)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailerError);
    // A relay that cannot do TLS is a configuration problem, so it is not retried.
    expect(err).toMatchObject({ retryable: false });
  });

  it("rejects invalid URLs without echoing the password", () => {
    const bad = [
      "http://u:topsecret@host:587",
      "smtp://u:topsecret@:587",
      "smtp://u:topsecret@host",
      "not a url topsecret",
      "smtp://u:%E0%A4%A@host:587",
    ];
    for (const url of bad) {
      let message = "";
      try {
        new SmtpMailer(url);
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message, url).not.toBe("");
      expect(message).not.toContain("topsecret");
    }
  });
});
