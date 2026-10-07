import { describe, expect, it } from "vitest";
import { doctor, exitCode, formatReport, runChecks, type CheckResult, type DoctorDeps, type DoctorDns } from "../src/doctor";

const env = {
  DOMAIN: "mail.acme.dev",
  MAIL_DOMAIN: "agents.acme.dev",
  SECRET_KEY: "s".repeat(40),
  DATABASE_URL: "postgres://send0:hunter2-db-pass@db:5432/send0",
  SMTP_URL: "smtp://relay-user:hunter2-smtp-pass@smtp.relay.dev:587",
  OWNER_EMAIL: "owner@acme.dev",
};

const notFound = () => Promise.reject(Object.assign(new Error("queryMx ENOTFOUND"), { code: "ENOTFOUND" }));

/** A zone where agents.acme.dev's MX points at mx.acme.dev, which shares mail.acme.dev's address. */
function zone(overrides: Partial<DoctorDns> = {}): DoctorDns {
  const a: Record<string, string[]> = {
    "mail.acme.dev": ["203.0.113.7"],
    "mx.acme.dev": ["203.0.113.7"],
    "mx.other.net": ["198.51.100.1"],
  };
  return {
    resolveMx: async (n) => (n === "agents.acme.dev" ? [{ exchange: "mx.acme.dev", priority: 10 }] : notFound()),
    resolve4: async (n) => a[n] ?? notFound(),
    resolve6: notFound,
    resolveTxt: async (n) => (n === "agents.acme.dev" ? [["v=spf1 include:", "relay.dev ~all"], ["other"]] : notFound()),
    ...overrides,
  };
}

function deps(overrides: Partial<DoctorDeps> = {}): DoctorDeps {
  return {
    env,
    dns: zone(),
    tcpConnect: async () => {},
    fetch: async () => new Response('{"ok":true}'),
    pendingMigrations: async () => [],
    verifyMailer: async () => ({ status: "ok", message: "SMTP relay smtp.relay.dev:587 accepted the connection and login" }),
    ...overrides,
  };
}

const byName = (results: CheckResult[], name: string) => results.find((r) => r.name === name);

describe("runChecks", () => {
  it("passes a healthy install", async () => {
    const results = await runChecks(deps());
    expect(results.map((r) => [r.name, r.status])).toEqual([
      ["config", "ok"],
      ["database", "ok"],
      ["mailer", "ok"],
      ["mx agents.acme.dev", "ok"],
      ["spf agents.acme.dev", "ok"],
      ["port 25 mx.acme.dev", "ok"],
      ["public url", "ok"],
    ]);
    expect(byName(results, "spf agents.acme.dev")?.message).toBe("v=spf1 include:relay.dev ~all");
    expect(exitCode(results)).toBe(0);
  });

  it("stops at config problems and lists them", async () => {
    const results = await runChecks(deps({ env: { DOMAIN: "mail.acme.dev" } }));
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: "config", status: "fail" });
    expect(results[0]!.details).toEqual(expect.arrayContaining([expect.stringMatching(/^SECRET_KEY: is required/)]));
    expect(exitCode(results)).toBe(1);
  });

  it("reports pending migrations as a warning and an unreachable database as a failure", async () => {
    const pending = await runChecks(deps({ pendingMigrations: async () => ["0003_teams"] }));
    expect(byName(pending, "database")).toMatchObject({ status: "warn", details: ["0003_teams"] });
    expect(exitCode(pending)).toBe(0);

    const down = await runChecks(deps({ pendingMigrations: () => Promise.reject(new Error("connect ECONNREFUSED")) }));
    expect(byName(down, "database")).toMatchObject({ status: "fail", message: "cannot connect: connect ECONNREFUSED" });
    expect(exitCode(down)).toBe(1);
  });

  it("passes the mailer's verdict through and fails when it throws", async () => {
    const sandbox = await runChecks(deps({ verifyMailer: async () => ({ status: "warn", message: "SES sandbox" }) }));
    expect(byName(sandbox, "mailer")).toMatchObject({ status: "warn", message: "SES sandbox" });

    const bad = await runChecks(deps({ verifyMailer: () => Promise.reject(new Error("SMTP relay rejected the login")) }));
    expect(byName(bad, "mailer")).toMatchObject({ status: "fail", message: "SMTP relay rejected the login" });
  });

  it("fails without an MX record and skips the port 25 check", async () => {
    const results = await runChecks(deps({ dns: zone({ resolveMx: notFound }) }));
    expect(byName(results, "mx agents.acme.dev")).toMatchObject({
      status: "fail",
      message: expect.stringContaining("MX 10 mail.acme.dev"),
    });
    expect(results.some((r) => r.name.startsWith("port 25"))).toBe(false);
  });

  it("accepts an MX naming DOMAIN directly, and warns about one elsewhere", async () => {
    const direct = await runChecks(deps({ dns: zone({ resolveMx: async () => [{ exchange: "Mail.Acme.dev.", priority: 5 }] }) }));
    expect(byName(direct, "mx agents.acme.dev")).toMatchObject({ status: "ok", message: "MX → mail.acme.dev" });

    const elsewhere = await runChecks(deps({ dns: zone({ resolveMx: async () => [{ exchange: "mx.other.net", priority: 5 }] }) }));
    expect(byName(elsewhere, "mx agents.acme.dev")?.status).toBe("warn");
    expect(exitCode(elsewhere)).toBe(0);
  });

  it("warns when SPF is missing", async () => {
    const results = await runChecks(deps({ dns: zone({ resolveTxt: async () => [["google-site-verification=x"]] }) }));
    expect(byName(results, "spf agents.acme.dev")).toMatchObject({ status: "warn", message: expect.stringContaining("no SPF record") });
  });

  it("warns when port 25 is unreachable", async () => {
    let asked: unknown[] = [];
    const results = await runChecks(
      deps({
        tcpConnect: async (...args) => {
          asked = args;
          throw new Error("no answer within 5s");
        },
      }),
    );
    expect(asked).toEqual(["mx.acme.dev", 25, 5_000]);
    expect(byName(results, "port 25 mx.acme.dev")).toMatchObject({
      status: "warn",
      message: expect.stringContaining("may be blocked by your provider, or hairpin NAT"),
    });
    expect(exitCode(results)).toBe(0);
  });

  it("warns when the public URL is unreachable or unhealthy", async () => {
    let url = "";
    const down = await runChecks(
      deps({
        fetch: async (input) => {
          url = String(input);
          throw new TypeError("fetch failed");
        },
      }),
    );
    expect(url).toBe("https://mail.acme.dev/healthz");
    expect(byName(down, "public url")).toMatchObject({ status: "warn", message: expect.stringContaining("not reachable: fetch failed") });

    const sick = await runChecks(deps({ fetch: async () => new Response("", { status: 503 }) }));
    expect(byName(sick, "public url")).toMatchObject({ status: "warn", message: "https://mail.acme.dev/healthz answered 503" });
  });

  it("never prints secrets", async () => {
    let out = "";
    await doctor(deps({ pendingMigrations: () => Promise.reject(new Error("boom")) }), (s) => (out += s));
    for (const secret of ["hunter2-db-pass", "hunter2-smtp-pass", "s".repeat(40)]) expect(out).not.toContain(secret);
  });
});

describe("formatReport", () => {
  it("aligns names, marks each status and sums up", () => {
    const text = formatReport([
      { name: "config", status: "ok", message: "loaded" },
      { name: "public url", status: "warn", message: "slow", details: ["try again"] },
      { name: "database", status: "fail", message: "down" },
    ]);
    expect(text).toBe(
      [
        "send0 doctor",
        "",
        "✓ config      loaded",
        "! public url  slow",
        "              - try again",
        "✗ database    down",
        "",
        "1 ok, 1 warning(s), 1 failed",
        "",
      ].join("\n"),
    );
  });
});

describe("doctor", () => {
  it("prints the report and returns 1 only when a check fails", async () => {
    let out = "";
    expect(await doctor(deps(), (s) => (out += s))).toBe(0);
    expect(out).toContain("✓ config");
    expect(await doctor(deps({ env: {} }), () => {})).toBe(1);
  });
});
