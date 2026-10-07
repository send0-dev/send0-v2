import { parse } from "jsonc-parser";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const APP_DIR = fileURLToPath(new URL("..", import.meta.url).href);
const SHA = "0123456789abcdef0123456789abcdef01234567";

interface WranglerConfig {
  main: string;
  no_bundle?: boolean;
  assets: { directory: string; binding: string; run_worker_first: string[] };
  hyperdrive: { binding: string; id: string; localConnectionString?: string }[];
  r2_buckets: { binding: string; bucket_name: string }[];
  queues: { producers: { binding: string; queue: string }[]; consumers: { queue: string }[] };
  durable_objects: { bindings: { name: string; class_name: string }[] };
  migrations: { tag: string; new_sqlite_classes: string[] }[];
  triggers: { crons: string[] };
  ratelimits: { name: string; namespace_id: string; simple: { limit: number; period: number } }[];
  vars: Record<string, string>;
}

const readConfig = (dir: string) => parse(readFileSync(path.join(dir, "wrangler.jsonc"), "utf8")) as WranglerConfig;

// Runs the real builder (wrangler's dry-run bundle included) into a temp dir. Turbo's ^build has
// already built the dashboard and the packages the Worker imports, so it skips that step.
describe("build-template.mjs", () => {
  let out: string;
  beforeAll(() => {
    out = path.join(mkdtempSync(path.join(tmpdir(), "send0-template-test-")), "out");
    const r = spawnSync(
      process.execPath,
      ["scripts/build-template.mjs", out, `--source-sha=${SHA}`, "--version=v1.2.3-rc.1", "--no-deps-build"],
      { cwd: APP_DIR, encoding: "utf8" },
    );
    expect(r.status, r.stderr).toBe(0);
  }, 120_000);
  afterAll(() => rmSync(path.dirname(out), { recursive: true, force: true }));

  it("writes a self-contained folder", () => {
    for (const f of [
      "worker/index.js",
      "public/index.html",
      "wrangler.jsonc",
      ".dev.vars.example",
      "package.json",
      "README.md",
      "LICENSE",
      "SOURCE.md",
      ".gitignore",
      ".github/workflows/close-pull-requests.yml",
    ]) {
      expect(existsSync(path.join(out, f)), f).toBe(true);
    }
    expect(existsSync(path.join(out, "worker/index.js.map"))).toBe(false);
    expect(existsSync(path.join(out, "worker/README.md"))).toBe(false);
  });

  it("points wrangler.jsonc at the prebuilt Worker and keeps every binding", () => {
    const source = readConfig(APP_DIR);
    const cfg = readConfig(out);
    expect(cfg.main).toBe("worker/index.js");
    expect(cfg.no_bundle).toBe(true);
    expect(cfg.assets).toEqual({ ...source.assets, directory: "./public" });
    expect(cfg.hyperdrive).toEqual([{ binding: "HYPERDRIVE", id: source.hyperdrive[0]!.id }]);
    expect(cfg.r2_buckets).toEqual([{ binding: "BLOBS", bucket_name: "send0-blobs" }]);
    expect(cfg.queues).toEqual(source.queues);
    expect(cfg.queues.producers).toEqual([{ binding: "EVENTS", queue: "send0-events" }]);
    expect(cfg.durable_objects).toEqual(source.durable_objects);
    expect(cfg.migrations).toEqual(source.migrations);
    expect(cfg.triggers).toEqual(source.triggers);
    expect(cfg.triggers.crons).toEqual(["0 * * * *"]);
    expect(cfg.ratelimits).toEqual(source.ratelimits);
    expect(cfg.ratelimits.map((r) => r.name)).toEqual(["RL_KEY", "RL_KEY_SEND", "RL_IP"]);
    expect(cfg.vars).toEqual(source.vars);
    expect(readFileSync(path.join(out, "wrangler.jsonc"), "utf8")).not.toMatch(/localConnectionString|src\/http\.ts|rate-limit\.ts/);
  });

  it("describes the package, the bindings and the source", () => {
    const pkg = JSON.parse(readFileSync(path.join(out, "package.json"), "utf8")) as {
      name: string;
      version: string;
      private: boolean;
      license: string;
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
      dependencies?: unknown;
      cloudflare: { bindings: Record<string, { description: string }> };
    };
    const wrangler = JSON.parse(readFileSync(path.join(APP_DIR, "node_modules/wrangler/package.json"), "utf8")) as { version: string };
    expect(pkg).toMatchObject({ name: "send0-cloudflare", version: "1.2.3-rc.1", private: true, license: "AGPL-3.0-only" });
    expect(pkg.scripts).toEqual({ deploy: "wrangler deploy" });
    expect(pkg.devDependencies).toEqual({ wrangler: wrangler.version });
    expect(pkg.dependencies).toBeUndefined();
    for (const b of ["HYPERDRIVE", "BLOBS", "EVENTS", "HUB", "RL_KEY", "RL_KEY_SEND", "RL_IP"])
      expect(pkg.cloudflare.bindings[b]?.description).toBeTruthy();

    const secrets = readFileSync(path.join(out, ".dev.vars.example"), "utf8")
      .split("\n")
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => l.split("=")[0]);
    expect(secrets).toEqual(["SECRET_KEY", "OWNER_EMAIL", "SES_ACCESS_KEY_ID", "SES_SECRET_ACCESS_KEY"]);
    // A name can't be both a var and a secret on one Worker.
    expect(secrets.filter((s) => s! in readConfig(out).vars)).toEqual([]);

    const commit = `https://github.com/send0-dev/send0-v2/tree/${SHA}`;
    expect(readFileSync(path.join(out, "SOURCE.md"), "utf8")).toContain(commit);
    const readme = readFileSync(path.join(out, "README.md"), "utf8");
    expect(readme).toContain("https://deploy.workers.cloudflare.com/?url=https://github.com/send0-dev/send0-cloudflare");
    expect(readme).toContain(`send0-dev/send0-v2@${SHA.slice(0, 12)}`);
    expect(readme).toContain("`PUBLIC_URL`: set it if you add a custom domain");
    expect(readFileSync(path.join(out, "LICENSE"), "utf8")).toContain("GNU AFFERO GENERAL PUBLIC LICENSE");
  });

  it("deploys as is (wrangler dry run)", () => {
    const r = spawnSync(path.join(APP_DIR, "node_modules/.bin/wrangler"), ["deploy", "--dry-run"], {
      cwd: out,
      encoding: "utf8",
      env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" },
    });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain("env.HYPERDRIVE");
  }, 60_000);
});
