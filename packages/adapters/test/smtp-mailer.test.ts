import type { AddressInfo } from "node:net";
import { SMTPServer, type SMTPServerOptions } from "smtp-server";
import { afterEach, describe, expect, it } from "vitest";
import { MailerError } from "../src/mailer";
import { parseSmtpUrl, SmtpMailer, type SmtpMailerOptions } from "../src/node/smtp-mailer";

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
  server.on("error", () => {}); // e.g. a client aborting the TLS handshake
  servers.push(server);
  return (server.server.address() as AddressInfo).port;
}

function mailer(url: string, opts?: SmtpMailerOptions): SmtpMailer {
  const m = new SmtpMailer(url, opts);
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

  it("treats a 4xx reply to DATA as a definitive, retryable rejection", async () => {
    const port = await start({
      onData(stream, _s, cb) {
        stream.resume();
        stream.on("end", () => cb(Object.assign(new Error("Try again later"), { responseCode: 451 })));
      },
    });
    const err = await send(mailer(`smtp://127.0.0.1:${port}`)).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 451, retryable: true });
  });

  it("fails permanently when only some recipients are rejected", async () => {
    const port = await start({
      onRcptTo: (a, _s, cb) => cb(a.address === "c@example.com" ? Object.assign(new Error("No such user"), { responseCode: 550 }) : null),
    });
    const err = (await send(mailer(`smtp://127.0.0.1:${port}`)).catch((e: unknown) => e)) as MailerError;
    expect(err).toMatchObject({ status: 422, retryable: false, code: "recipients_rejected" });
    expect(err.message).toContain("c@example.com");
    expect(err.message).not.toContain("b@example.com");
  });

  it("does not retry when the relay never answers after DATA (delivery_unknown)", async () => {
    const port = await start({
      onData(stream) {
        stream.resume(); // accept the body, then never reply
      },
    });
    const err = await send(mailer(`smtp://127.0.0.1:${port}`, { timeouts: { socket: 300 } })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailerError);
    expect(err).toMatchObject({ status: 502, retryable: false, code: "delivery_unknown" });
  });

  it("does not retry when the connection drops mid-DATA", async () => {
    const port = await start({
      onData(stream) {
        stream.once("data", () => stream.destroy());
        stream.on("error", () => {});
        stream.resume();
      },
    });
    const m = mailer(`smtp://127.0.0.1:${port}`, { timeouts: { socket: 500 } });
    const err = await send(m).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailerError);
    expect((err as MailerError).retryable).toBe(false);
  });

  it("times out a silent relay before the greeting as retryable, with a fixed message", async () => {
    const net = await import("node:net");
    const sockets: import("node:net").Socket[] = [];
    const silent = net.createServer((s) => sockets.push(s));
    await new Promise<void>((r) => silent.listen(0, "127.0.0.1", r));
    const port = (silent.address() as AddressInfo).port;
    const err = (await send(mailer(`smtp://127.0.0.1:${port}`, { timeouts: { greeting: 200 } })).catch((e: unknown) => e)) as MailerError;
    sockets.forEach((s) => s.destroy());
    await new Promise((r) => silent.close(r));
    expect(err).toMatchObject({ status: 503, retryable: true, message: "SMTP relay timed out" });
  });

  it("connects over implicit TLS with smtps:// (self-signed cert via the tls override)", async () => {
    let data = "";
    const port = await start({
      secure: true,
      disabledCommands: [],
      onData(stream, _s, cb) {
        const chunks: Buffer[] = [];
        stream.on("data", (c: Buffer) => chunks.push(c));
        stream.on("end", () => ((data = Buffer.concat(chunks).toString("utf8")), cb()));
      },
    });
    await send(mailer(`smtps://127.0.0.1:${port}`, { tls: { rejectUnauthorized: false } }));
    expect(data).toBe(RAW);
  });

  it("refuses a self-signed cert by default", async () => {
    const port = await start({ secure: true, disabledCommands: [] });
    const err = await send(mailer(`smtps://127.0.0.1:${port}`)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailerError);
  });

  it("handles + and % in usernames and passwords", async () => {
    let seen = { user: "", pass: "" };
    const port = await start({
      authOptional: false,
      onAuth(auth, _s, cb) {
        seen = { user: auth.username ?? "", pass: auth.password ?? "" };
        cb(null, { user: "x" });
      },
    });
    await send(mailer(`smtp://${enc("a+b%c@d")}:${enc("50%+off")}@127.0.0.1:${port}`));
    expect(seen).toEqual({ user: "a+b%c@d", pass: "50%+off" });
  });

  it("uses the id from a 'queued as' reply", async () => {
    const port = await start({
      onData(stream, _s, cb) {
        stream.resume();
        stream.on("end", () => cb(null, "Ok: queued as 4F3A1B2C"));
      },
    });
    const res = await send(mailer(`smtp://127.0.0.1:${port}`));
    expect(res.providerMessageId).toBe("4F3A1B2C");
  });

  it("connects to IPv6 literals", async (ctx) => {
    const server = new SMTPServer({ secure: false, disabledCommands: ["STARTTLS"], authOptional: true, logger: false });
    const listening = await new Promise<boolean>((r) => {
      server.server.once("error", () => r(false));
      server.listen(0, "::1", () => r(true));
    });
    if (!listening) return ctx.skip();
    servers.push(server);
    const port = (server.server.address() as AddressInfo).port;
    await expect(mailer(`smtp://[::1]:${port}`).verify()).resolves.toBeUndefined();
  });

  it("retries a 454 login failure but not a 535", async () => {
    const port = await start({
      authOptional: false,
      onAuth: (_a, _s, cb) => cb(Object.assign(new Error("Temporary auth failure"), { responseCode: 454 })),
    });
    await expect(mailer(`smtp://u:p@127.0.0.1:${port}`).verify()).rejects.toMatchObject({ code: "auth_failed", retryable: true });
  });

  it("requires TLS by default for remote hosts with credentials, unless opted out", async () => {
    // Constructing never connects; this only exercises URL option parsing.
    expect(() => new SmtpMailer("smtp://u:p@relay.example.com:587?require_tls=false").close()).not.toThrow();
    expect(() => new SmtpMailer("smtp://u:p@relay.example.com:587?require_tls=maybe")).toThrow(/require_tls/);
    expect(() => new SmtpMailer("smtp://u:p@relay.example.com:465")).toThrow(/smtps:\/\//);
    expect(() => new SmtpMailer("smtp://u:p@relay.example.com:0")).toThrow(/port/);
  });

  it("fails against a plaintext remote-style relay when credentials are set and TLS is required", async () => {
    const port = await start({ authOptional: false });
    // Same server, but explicit require_tls=true stands in for the non-loopback default.
    const err = await mailer(`smtp://${USER}:${enc(PASS)}@127.0.0.1:${port}?require_tls=true`)
      .verify()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailerError);
    expect((err as MailerError).retryable).toBe(false);
  });
});

describe("parseSmtpUrl", () => {
  it("reads host, port, TLS mode and decoded credentials without connecting", () => {
    expect(parseSmtpUrl("smtp://us%40er:p%2Fss@relay.dev:587")).toEqual({
      host: "relay.dev",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: "us@er", pass: "p/ss" },
    });
    expect(parseSmtpUrl("smtps://relay.dev:465")).toEqual({ host: "relay.dev", port: 465, secure: true, requireTLS: false });
    expect(parseSmtpUrl("smtp://u:p@localhost:25")).toMatchObject({ requireTLS: false });
    expect(parseSmtpUrl("smtp://u:p@relay.dev:587?require_tls=0")).toMatchObject({ requireTLS: false });
    expect(parseSmtpUrl("smtp://relay.dev:587?require_tls=true")).toMatchObject({ requireTLS: true });
  });

  it("names each problem, never the password", () => {
    const cases: [string, RegExp][] = [
      ["smtp://u:hunter2@relay.dev", /missing a port/],
      ["smtp://u:hunter2@relay.dev:465", /port 465 uses implicit TLS/],
      ["smtp://u:hunter2@relay.dev:587?require_tls=maybe", /require_tls must be true, false, 1 or 0/],
      ["smtp://u:hunter2%zz@relay.dev:587", /not valid percent-encoding/],
      ["http://u:hunter2@relay.dev:587", /smtp:\/\/ or smtps:\/\//],
    ];
    for (const [url, message] of cases) {
      let err: unknown;
      try {
        parseSmtpUrl(url);
      } catch (e) {
        err = e;
      }
      expect(err, url).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(message);
      expect((err as Error).message).not.toContain("hunter2");
    }
  });
});
