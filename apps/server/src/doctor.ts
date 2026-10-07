import { SesMailer } from "@send0/adapters/mailer";
import { SmtpMailer } from "@send0/adapters/node/smtp-mailer";
import { pendingMigrations } from "@send0/db/migrate";
import { promises as dns } from "node:dns";
import { connect } from "node:net";
import { ConfigError, loadConfig, type MailerConfig, type ServerConfig } from "./config";

export type CheckStatus = "ok" | "warn" | "fail";

/** One line of the checklist, with optional indented detail lines under it. */
export interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
  details?: string[];
}

/** The DNS lookups the doctor makes; Node's resolver by default, a fake in tests. */
export interface DoctorDns {
  resolveMx(name: string): Promise<{ exchange: string; priority: number }[]>;
  resolve4(name: string): Promise<string[]>;
  resolve6(name: string): Promise<string[]>;
  resolveTxt(name: string): Promise<string[][]>;
}

/** Everything that touches the network, injectable so the tests run offline. */
export interface DoctorDeps {
  env: Record<string, string | undefined>;
  dns: DoctorDns;
  /** Opens a TCP connection and closes it again; rejects on error or after `timeoutMs`. */
  tcpConnect: (host: string, port: number, timeoutMs: number) => Promise<void>;
  fetch: typeof fetch;
  /** The migrations `start` would apply. Throws when the database is unreachable. */
  pendingMigrations: (config: ServerConfig) => Promise<string[]>;
  /** Logs in to the outbound relay without sending; "unchecked" when the transport has no cheap check. */
  verifyMailer: (mailer: MailerConfig) => Promise<{ status: CheckStatus; message: string }>;
}

/** How long any single network check may take. */
export const CHECK_TIMEOUT_MS = 5_000;

const SYMBOL: Record<CheckStatus, string> = { ok: "✓", warn: "!", fail: "✗" };

const withTimeout = <T>(p: Promise<T>, ms: number, what: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s`)), ms);
    p.then(resolve, reject).finally(() => clearTimeout(timer));
  });

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const dnsCode = (err: unknown) => (err as { code?: string }).code;
const NO_RECORDS = new Set(["ENOTFOUND", "ENODATA"]);

/** Node's resolver with short timeouts, so a dead DNS server can't stall the doctor. */
function systemDns(): DoctorDns {
  const r = new dns.Resolver({ timeout: 2_000, tries: 2 });
  return {
    resolveMx: (n) => r.resolveMx(n),
    resolve4: (n) => r.resolve4(n),
    resolve6: (n) => r.resolve6(n),
    resolveTxt: (n) => r.resolveTxt(n),
  };
}

function tcpConnect(host: string, port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`no answer within ${timeoutMs / 1000}s`));
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve();
    });
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function verifyMailer(mailer: MailerConfig): Promise<{ status: CheckStatus; message: string }> {
  if (mailer.kind === "smtp") {
    const url = new URL(mailer.url);
    const what = url.username ? "connection and login" : "connection";
    const smtp = new SmtpMailer(mailer.url, {
      timeouts: { connection: CHECK_TIMEOUT_MS, greeting: CHECK_TIMEOUT_MS, socket: CHECK_TIMEOUT_MS },
    });
    try {
      await smtp.verify();
      return { status: "ok", message: `SMTP relay ${url.host} accepted the ${what}` };
    } finally {
      smtp.close();
    }
  }
  const ses = new SesMailer(mailer);
  const account = await ses.verify({ signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
  if (!account.sendingEnabled) return { status: "fail", message: `SES (${mailer.region}): sending is disabled for this account` };
  if (!account.productionAccessEnabled) {
    return {
      status: "warn",
      message: `SES (${mailer.region}): credentials work, but the account is in the SES sandbox (verified recipients only)`,
    };
  }
  return { status: "ok", message: `SES (${mailer.region}): credentials work and production access is enabled` };
}

/** The real network: system DNS, TCP, fetch, Postgres and the configured mailer. */
export function defaultDoctorDeps(env: Record<string, string | undefined> = process.env): DoctorDeps {
  return {
    env,
    dns: systemDns(),
    tcpConnect,
    fetch: (input, init) => fetch(input, init),
    pendingMigrations: (config) =>
      pendingMigrations(config.databaseUrl, {
        ...(config.migrationsDir ? { migrationsFolder: config.migrationsDir } : {}),
        connectTimeoutSeconds: CHECK_TIMEOUT_MS / 1000,
      }),
    verifyMailer,
  };
}

async function checkDatabase(config: ServerConfig, deps: DoctorDeps): Promise<CheckResult> {
  try {
    const pending = await withTimeout(deps.pendingMigrations(config), CHECK_TIMEOUT_MS * 2, "the database check");
    if (!pending.length) return { name: "database", status: "ok", message: "connected; migrations are up to date" };
    return {
      name: "database",
      status: "warn",
      message: `connected; ${pending.length} migration(s) pending (they run automatically on start)`,
      details: pending,
    };
  } catch (err) {
    return { name: "database", status: "fail", message: `cannot connect: ${errorText(err)}` };
  }
}

async function checkMailer(config: ServerConfig, deps: DoctorDeps): Promise<CheckResult> {
  try {
    const r = await withTimeout(deps.verifyMailer(config.mailer), CHECK_TIMEOUT_MS * 2, "the mailer check");
    return { name: "mailer", ...r };
  } catch (err) {
    return { name: "mailer", status: "fail", message: errorText(err) };
  }
}

/** Every address `host` resolves to; empty when it has none. */
async function addresses(deps: DoctorDeps, host: string): Promise<string[]> {
  const lookups = await Promise.allSettled([deps.dns.resolve4(host), deps.dns.resolve6(host)]);
  return lookups.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

/** The MX targets of `domain`, best first; null when it has none. */
async function mxTargets(deps: DoctorDeps, domain: string): Promise<string[] | null> {
  try {
    const records = await withTimeout(deps.dns.resolveMx(domain), CHECK_TIMEOUT_MS, "the MX lookup");
    const sorted = records.filter((r) => r.exchange).sort((a, b) => a.priority - b.priority);
    return sorted.length ? sorted.map((r) => r.exchange.toLowerCase().replace(/\.$/, "")) : null;
  } catch (err) {
    if (NO_RECORDS.has(dnsCode(err) ?? "")) return null;
    throw err;
  }
}

async function checkMx(config: ServerConfig, deps: DoctorDeps, domain: string, targets: string[] | null | Error): Promise<CheckResult> {
  const name = `mx ${domain}`;
  if (targets instanceof Error) return { name, status: "fail", message: `MX lookup failed: ${errorText(targets)}` };
  if (!targets) {
    return { name, status: "fail", message: `no MX record; add one: ${domain} MX 10 ${config.smtp.hostname}` };
  }
  const ours = new Set([config.domain, config.smtp.hostname]);
  if (targets.some((t) => ours.has(t))) return { name, status: "ok", message: `MX → ${targets.join(", ")}` };
  try {
    const [want, got] = await withTimeout(
      Promise.all([addresses(deps, config.domain), Promise.all(targets.map((t) => addresses(deps, t))).then((a) => a.flat())]),
      CHECK_TIMEOUT_MS,
      "the address lookup",
    );
    if (want.length && got.some((ip) => want.includes(ip))) {
      return { name, status: "ok", message: `MX → ${targets.join(", ")} (same address as ${config.domain})` };
    }
  } catch {
    // Fall through to the warning: we could not prove the MX reaches this server.
  }
  return {
    name,
    status: "warn",
    message: `MX → ${targets.join(", ")}, which does not resolve to the same address as ${config.domain}`,
    details: ["Fine if a relay or load balancer forwards port 25 here; otherwise mail goes elsewhere."],
  };
}

async function checkSpf(deps: DoctorDeps, domain: string): Promise<CheckResult> {
  const name = `spf ${domain}`;
  try {
    const txt = await withTimeout(deps.dns.resolveTxt(domain), CHECK_TIMEOUT_MS, "the TXT lookup");
    const spf = txt.map((chunks) => chunks.join("")).find((t) => /^v=spf1(\s|$)/i.test(t));
    if (spf) return { name, status: "ok", message: spf };
  } catch (err) {
    if (!NO_RECORDS.has(dnsCode(err) ?? "")) return { name, status: "warn", message: `TXT lookup failed: ${errorText(err)}` };
  }
  return {
    name,
    status: "warn",
    message: "no SPF record; receivers may reject or junk mail sent from this domain",
    details: [`Add a TXT record on ${domain} that includes your outbound relay, e.g. "v=spf1 include:<relay> ~all".`],
  };
}

async function checkPort25(deps: DoctorDeps, target: string): Promise<CheckResult> {
  const name = `port 25 ${target}`;
  try {
    await deps.tcpConnect(target, 25, CHECK_TIMEOUT_MS);
    return { name, status: "ok", message: "reachable" };
  } catch (err) {
    return {
      name,
      status: "warn",
      message: `could not connect (${errorText(err)}); may be blocked by your provider, or hairpin NAT`,
      details: ["Test from another network: `nc -vz <host> 25`."],
    };
  }
}

async function checkPublicUrl(config: ServerConfig, deps: DoctorDeps): Promise<CheckResult> {
  const url = `${config.publicUrl}/healthz`;
  try {
    const res = await deps.fetch(url, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS), redirect: "follow" });
    if (res.ok) return { name: "public url", status: "ok", message: `${url} answered ${res.status}` };
    return { name: "public url", status: "warn", message: `${url} answered ${res.status}` };
  } catch (err) {
    return { name: "public url", status: "warn", message: `${url} is not reachable: ${errorText(err)}` };
  }
}

/** Runs every check. A config problem stops there, since the other checks need a valid config. */
export async function runChecks(deps: DoctorDeps): Promise<CheckResult[]> {
  let config: ServerConfig;
  try {
    config = loadConfig(deps.env);
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    return [{ name: "config", status: "fail", message: "invalid; fix these and run again", details: err.problems }];
  }
  const configOk: CheckResult = {
    name: "config",
    status: "ok",
    message: `loaded (${config.publicUrl}, mail for ${config.mailDomains.join(", ")})`,
  };

  const mx = await Promise.all(config.mailDomains.map((d) => mxTargets(deps, d).catch((err: unknown) => new Error(errorText(err)))));
  const port25Targets = [...new Set(mx.flatMap((t) => (Array.isArray(t) && t[0] ? [t[0]] : [])))];

  const [database, mailer, mxChecks, spfChecks, port25Checks, publicUrl] = await Promise.all([
    checkDatabase(config, deps),
    checkMailer(config, deps),
    Promise.all(config.mailDomains.map((d, i) => checkMx(config, deps, d, mx[i]!))),
    Promise.all(config.mailDomains.map((d) => checkSpf(deps, d))),
    Promise.all(port25Targets.map((t) => checkPort25(deps, t))),
    checkPublicUrl(config, deps),
  ]);
  return [configOk, database, mailer, ...mxChecks, ...spfChecks, ...port25Checks, publicUrl];
}

/** Renders the checklist with a summary line, ready to print. */
export function formatReport(results: CheckResult[]): string {
  const width = Math.max(...results.map((r) => r.name.length));
  const lines = ["send0 doctor", ""];
  for (const r of results) {
    lines.push(`${SYMBOL[r.status]} ${r.name.padEnd(width)}  ${r.message}`);
    for (const d of r.details ?? []) lines.push(`  ${" ".repeat(width)}  - ${d}`);
  }
  const count = (s: CheckStatus) => results.filter((r) => r.status === s).length;
  lines.push("", `${count("ok")} ok, ${count("warn")} warning(s), ${count("fail")} failed`);
  return `${lines.join("\n")}\n`;
}

/** 1 if any check failed, else 0 (warnings pass). */
export const exitCode = (results: CheckResult[]): number => (results.some((r) => r.status === "fail") ? 1 : 0);

/** `send0 doctor`: prints the checklist and returns the exit code. */
export async function doctor(
  deps: DoctorDeps = defaultDoctorDeps(),
  out: (s: string) => void = (s) => process.stdout.write(s),
): Promise<number> {
  const results = await runChecks(deps);
  out(formatReport(results));
  return exitCode(results);
}
