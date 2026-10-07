#!/usr/bin/env node
/**
 * Builds the self-contained Deploy to Cloudflare template, published as send0-dev/send0-cloudflare.
 *
 *   node apps/cloudflare/scripts/build-template.mjs <outDir> [--source-sha=<sha>] [--version=<v>] [--no-deps-build]
 *
 * Cloudflare's Deploy button clones that repo, runs `npm install` and then the `deploy` script, so
 * the folder can't depend on this workspace: it holds the Worker pre-bundled by wrangler (uploaded
 * as is, with `no_bundle`), the built dashboard, and a wrangler.jsonc derived from this app's.
 *
 * Builds the workspace packages the Worker imports first (turbo, so cached locally), unless
 * --no-deps-build says they already are (the tests run after turbo's ^build). Replaces the
 * contents of <outDir>, which must be empty, missing, or a previous build (it has a SOURCE.md).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyEdits, modify, parse } from "jsonc-parser";

const APP_DIR = fileURLToPath(new URL("..", import.meta.url));
const REPO = path.resolve(APP_DIR, "../..");
const WEB_DIST = path.join(REPO, "apps/web/dist/client");
const UPSTREAM = "send0-dev/send0-v2";
const TEMPLATE_REPO = "send0-dev/send0-cloudflare";
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

function fail(msg) {
  console.error(`build-template: ${msg}`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", ...opts });
  if (r.status !== 0) fail(`\`${cmd} ${args.join(" ")}\` failed:\n${r.stdout ?? ""}${r.stderr ?? ""}`);
  return r.stdout.trim();
}

function parseArgs(argv) {
  const opts = { outDir: undefined, sourceSha: undefined, version: undefined, depsBuild: true };
  for (const arg of argv) {
    const [key, value] = arg.split(/=(.*)/s);
    if (key === "--source-sha") opts.sourceSha = value;
    else if (key === "--version") opts.version = value;
    else if (arg === "--no-deps-build") opts.depsBuild = false;
    else if (arg.startsWith("-")) fail(`unknown option ${arg}`);
    else if (!opts.outDir) opts.outDir = path.resolve(arg);
    else fail(`unexpected argument ${arg}`);
  }
  if (!opts.outDir) fail("usage: build-template.mjs <outDir> [--source-sha=<sha>] [--version=<v>] [--no-deps-build]");
  opts.sourceSha ??= run("git", ["rev-parse", "HEAD"], { cwd: REPO });
  if (!/^[0-9a-f]{40}$/.test(opts.sourceSha)) fail("--source-sha must be a full 40-character commit SHA");
  opts.version = (opts.version ?? "0.0.0-dev").replace(/^v/, "");
  if (!SEMVER.test(opts.version)) fail(`--version must be semver, like 1.2.3 (got ${opts.version})`);
  return opts;
}

/** Empties outDir, refusing anything that doesn't look like a previous build. */
async function prepareOutDir(outDir) {
  if (existsSync(outDir)) {
    const entries = readdirSync(outDir);
    if (entries.length && !entries.includes("SOURCE.md")) fail(`${outDir} is not empty and is not a previous template build`);
    if (path.resolve(outDir) === REPO || REPO.startsWith(path.resolve(outDir) + path.sep)) fail("outDir can't contain this repo");
    for (const e of entries) if (e !== ".git") await rm(path.join(outDir, e), { recursive: true, force: true });
  }
  await mkdir(outDir, { recursive: true });
}

/** wrangler's bundle of this app: index.js plus any extra modules, without sourcemaps or its README. */
async function bundleWorker(dest) {
  const tmp = await mkdtemp(path.join(tmpdir(), "send0-worker-"));
  try {
    run(path.join(APP_DIR, "node_modules/.bin/wrangler"), ["deploy", "--dry-run", "--outdir", tmp], {
      cwd: APP_DIR,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" },
    });
    const files = (await readdir(tmp, { recursive: true, withFileTypes: true })).filter((d) => d.isFile());
    const kept = files
      .map((d) => path.relative(tmp, path.join(d.parentPath, d.name)))
      .filter((f) => f !== "README.md" && !f.endsWith(".map"));
    if (!kept.includes("index.js")) fail(`wrangler emitted no index.js (got ${kept.join(", ")})`);
    for (const f of kept) {
      await mkdir(path.dirname(path.join(dest, f)), { recursive: true });
      await cp(path.join(tmp, f), path.join(dest, f));
    }
    return kept.sort();
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** This app's wrangler.jsonc, comments kept, pointed at the prebuilt Worker and the bundled dashboard. */
async function templateWranglerConfig(extraModules) {
  let text = await readFile(path.join(APP_DIR, "wrangler.jsonc"), "utf8");
  const source = parse(text);
  const fmt = { formattingOptions: { insertSpaces: true, tabSize: 2 } };
  const set = (p, value) => (text = applyEdits(text, modify(text, p, value, fmt)));

  // Text that only makes sense in the monorepo.
  const replaceText = (from, to) => {
    if (!text.includes(from)) fail(`wrangler.jsonc no longer contains ${JSON.stringify(from)}; update build-template.mjs`);
    text = text.replace(from, to);
  };
  replaceText(
    "  // The dashboard SPA (apps/web's build). API and dashboard routes",
    "  // The dashboard SPA, prebuilt in public/. API and dashboard routes",
  );
  replaceText("    // Keep in step with WORKER_PATHS in src/http.ts.\n", "");
  replaceText(
    "  // then put its id here. `wrangler dev` uses localConnectionString instead.\n",
    "  // then put its id here. The Deploy to Cloudflare button asks for the connection string instead.\n",
  );

  // Upload the module wrangler already bundled, byte for byte (and any extra modules it emitted).
  const extra = extraModules.length ? `\n  "base_dir": "worker",\n  "find_additional_modules": true,` : "";
  replaceText(`  "main": ${JSON.stringify(source.main)},\n`, `  "main": "worker/index.js",\n  "no_bundle": true,${extra}\n`);
  set(["assets", "directory"], "./public");
  source.hyperdrive.forEach((_, i) => set(["hyperdrive", i, "localConnectionString"], undefined));
  return text;
}

const DEV_VARS_EXAMPLE = `# Secrets the Deploy to Cloudflare button asks for. Set the plain settings (MAIL_DOMAINS, SES_REGION,
# ALLOW_SIGNUP) on the same screen: they are the vars in wrangler.jsonc.
# For \`wrangler dev\`, copy this to .dev.vars. Never commit .dev.vars.

# Signs download links. At least 32 characters: openssl rand -hex 32
SECRET_KEY=

# The email of the first account, who becomes the owner. Sign-up is closed to everyone else.
OWNER_EMAIL=

# An IAM user allowed ses:SendRawEmail for your verified SES identity (in SES_REGION). Required:
# send0 sends the owner's verification email and all outbound mail through SES.
SES_ACCESS_KEY_ID=
SES_SECRET_ACCESS_KEY=
`;

function packageJson(version, wranglerVersion) {
  return {
    name: "send0-cloudflare",
    version,
    private: true,
    description: "send0 in one Cloudflare Worker: an open-source email API where the inbox is the core object.",
    license: "AGPL-3.0-only",
    repository: { type: "git", url: `https://github.com/${UPSTREAM}` },
    scripts: { deploy: "wrangler deploy" },
    devDependencies: { wrangler: wranglerVersion },
    cloudflare: {
      bindings: {
        HYPERDRIVE: {
          description:
            "Your Postgres, e.g. a free [Neon](https://neon.tech) database. Paste its connection string; send0 creates its tables on first start.",
        },
        BLOBS: { description: "R2 bucket for raw mail and attachments." },
        EVENTS: { description: "Queue for webhook fan-out and delivery retries." },
        HUB: { description: "Durable Object for real-time events: SSE, WebSocket and the `wait` long-poll." },
        MAIL_DOMAINS: {
          description:
            "Domains you receive mail on, comma-separated, like `agents.acme.com`. Each must be on Cloudflare with **Email Routing** enabled.",
        },
        SES_REGION: { description: "The AWS region of your verified SES identity, like `us-east-1`." },
        ALLOW_SIGNUP: { description: "Leave `false`: only OWNER_EMAIL can sign up, everyone else joins by invite." },
        SECRET_KEY: { description: "Signs download links. At least 32 characters: `openssl rand -hex 32`." },
        OWNER_EMAIL: { description: "Your email. The first account, who becomes the owner, must use it." },
        SES_ACCESS_KEY_ID: { description: "Access key of an IAM user allowed `ses:SendRawEmail` for your SES identity." },
        SES_SECRET_ACCESS_KEY: { description: "Secret key of that IAM user." },
      },
    },
  };
}

function readme({ sha, version }) {
  return `# send0 for Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/${TEMPLATE_REPO})

send0 is an open-source email API where the inbox is the core object: one API call gives an agent or
an app an address that can send, receive, thread replies and push webhooks. This repo runs all of it
(API, dashboard, inbound mail, webhooks, real-time events) in one Worker on your own Cloudflare account.

> Generated from [${UPSTREAM}@${sha.slice(0, 12)}](https://github.com/${UPSTREAM}/commit/${sha}) (send0 ${version}).
> Don't edit here; pull requests are closed automatically. Contribute upstream at
> [${UPSTREAM}](https://github.com/${UPSTREAM}).

## What you need

- A Cloudflare account. The Workers free plan is enough to start.
- A Postgres connection string, such as a free [Neon](https://neon.tech) database. The Worker reaches it
  through Hyperdrive and creates its tables on first start.
- An AWS account with an SES identity (your mail domain) and an IAM user allowed \`ses:SendRawEmail\`.
  send0 sends all mail through SES, including the owner's verification email, so it won't start without it.
- A domain on Cloudflare (its nameservers point to Cloudflare) to receive mail on, like \`agents.acme.com\`.

## Deploy

Click the button above. Cloudflare copies this repo to your GitHub or GitLab account, creates the R2
bucket, the queue, the Hyperdrive connection and the Durable Object, and asks for:

| Setting | What to enter |
| --- | --- |
| Hyperdrive | Your Postgres connection string |
| \`MAIL_DOMAINS\` | The domain(s) you receive mail on, comma-separated. The first is the default for new inboxes |
| \`SES_REGION\` | The region of your SES identity |
| \`ALLOW_SIGNUP\` | Leave \`false\` |
| \`SECRET_KEY\` | 32+ random characters: \`openssl rand -hex 32\` |
| \`OWNER_EMAIL\` | Your email; the first account must use it |
| \`SES_ACCESS_KEY_ID\`, \`SES_SECRET_ACCESS_KEY\` | The IAM user's keys |

Optional settings, added later as variables under Workers & Pages > send0 > Settings:
\`MAIL_FROM\` (sender of account email; defaults to \`noreply@\` your first mail domain), \`PUBLIC_URL\`,
\`SES_CONFIGURATION_SET\`, and \`SES_EVENTS_TOKEN\` with \`SES_EVENTS_TOPIC_ARN\` (see step 2).

\`PUBLIC_URL\`: set it if you add a custom domain, to that origin (like \`https://mail.acme.com\`).
send0 then redirects every other hostname, including workers.dev, to it, so sign-in, download
links and webhooks all use one URL. Unset, each request's own origin is used.

If a setting is wrong, every page shows which one and why (never its value) until you fix it.

## After deploying

1. **Email Routing.** In the Cloudflare dashboard, open each mail domain, go to Email > Email Routing
   and enable it (Cloudflare adds the MX and SPF records). Then under Routing rules, set the
   **catch-all** action to "Send to a Worker" and pick \`send0\` (or the name you gave the Worker).
   Mail to addresses that aren't inboxes is rejected during the SMTP session.
2. **SES.**
   - Verify the mail domain as an SES identity in \`SES_REGION\`, with Easy DKIM (add the three CNAME
     records it shows). A custom MAIL FROM domain and a DMARC record help deliverability.
   - Request production access. Until AWS grants it, SES only delivers to verified addresses, so
     verify your own email address in SES too, or the owner's verification email won't arrive.
   - Optional, for delivery, bounce and complaint events: create an SNS topic, set it as the event
     destination of a configuration set (and set \`SES_CONFIGURATION_SET\`), set \`SES_EVENTS_TOKEN\`
     (32+ random characters) and \`SES_EVENTS_TOPIC_ARN\`, then add an HTTPS subscription to
     \`https://<your send0 URL>/internal/ses-events?token=<SES_EVENTS_TOKEN>\` (your \`PUBLIC_URL\` if set). send0 confirms it.
3. **Sign up.** Open the Worker URL (\`https://send0.<your subdomain>.workers.dev\`, or a custom domain
   you attach), sign up as \`OWNER_EMAIL\` and follow the verification email. Then create inboxes and
   API keys from the dashboard, and invite your team.

## Upgrading

Each send0 release replaces this repo's contents with a new build (as one fresh commit). To upgrade
the copy the button made for you, copy the new release's files over it, keeping the resource ids the
button wrote into your \`wrangler.jsonc\`, then commit and push: Workers Builds redeploys it. Or deploy
by hand with \`npm install && npx wrangler deploy\`. Database migrations run on first start.

## Limits

- Mail is received only on domains whose DNS is on your Cloudflare account, through Email Routing
  (messages up to 25 MiB).
- Free-plan Workers allow 100,000 requests a day and 10 ms of CPU per request. Large webhook volumes,
  big attachments or busy inboxes may need Workers Paid ($5/month).
- Raw mail and attachments live in R2 (10 GB free). There is no automatic retention yet.
- The hosted service's plan limits (reply-only free tier, daily send caps) are off: you own the SES
  account and its reputation.

## License

send0 is licensed under the [GNU AGPL v3](LICENSE). The corresponding source is described in
[SOURCE.md](SOURCE.md).
`;
}

function sourceMd({ sha, version }) {
  return `# Corresponding source

This repository is built, not written. Its contents are generated from send0 ${version}, commit:

https://github.com/${UPSTREAM}/tree/${sha}

That commit is the complete corresponding source (GNU AGPL v3, section 6) of the prebuilt Worker in
\`worker/\` and the dashboard in \`public/\`. To rebuild this folder from it:

\`\`\`sh
git clone https://github.com/${UPSTREAM} && cd send0-v2 && git checkout ${sha}
pnpm install --frozen-lockfile
node apps/cloudflare/scripts/build-template.mjs ../send0-cloudflare --source-sha=${sha} --version=${version}
\`\`\`

If you modify send0 and let others use it over a network, AGPL section 13 requires you to offer them
your modified source too.
`;
}

const CLOSE_PULL_REQUESTS = `name: Close pull requests

# This repo is generated from send0-dev/send0-v2 on every release, so changes made here would be lost.
on:
  pull_request_target:
    types: [opened, reopened]

permissions:
  pull-requests: write
  issues: write

jobs:
  close:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      # Never checks out the pull request's code.
      - env:
          GH_TOKEN: \${{ github.token }}
          PR: \${{ github.event.pull_request.number }}
          REPO: \${{ github.repository }}
        run: |
          gh pr close "$PR" --repo "$REPO" --comment "Thanks! This repository is generated from [${UPSTREAM}](https://github.com/${UPSTREAM}) on every release, so changes made here would be overwritten. Please open your pull request there instead."
`;

const GITIGNORE = `node_modules/
.dev.vars
.dev.vars.*
!.dev.vars.example
.wrangler/
`;

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { outDir } = opts;
  const sha = opts.sourceSha;

  if (opts.depsBuild) {
    console.log("▸ building the workspace packages the Worker imports (and the dashboard)");
    run("pnpm", ["exec", "turbo", "run", "build", "--filter=@send0/cloudflare^...", "--output-logs=errors-only"], { cwd: REPO });
  }
  if (!existsSync(path.join(WEB_DIST, "index.html"))) {
    run("pnpm", ["--filter", "@send0/web", "build"], { cwd: REPO });
    if (!existsSync(path.join(WEB_DIST, "index.html"))) fail("building the dashboard produced no index.html");
  }

  await prepareOutDir(outDir);

  console.log("▸ bundling the Worker");
  const modules = await bundleWorker(path.join(outDir, "worker"));
  const extraModules = modules.filter((m) => m !== "index.js");

  console.log("▸ copying the dashboard");
  await cp(WEB_DIST, path.join(outDir, "public"), { recursive: true });

  const appPkg = JSON.parse(await readFile(path.join(APP_DIR, "package.json"), "utf8"));
  const wranglerPkg = JSON.parse(await readFile(path.join(APP_DIR, "node_modules/wrangler/package.json"), "utf8"));
  if (!appPkg.devDependencies?.wrangler) fail("apps/cloudflare/package.json has no wrangler devDependency");

  console.log("▸ writing the config and docs");
  const write = (name, content) => writeFile(path.join(outDir, name), content);
  await write("wrangler.jsonc", await templateWranglerConfig(extraModules));
  await write(".dev.vars.example", DEV_VARS_EXAMPLE);
  await write("package.json", JSON.stringify(packageJson(opts.version, wranglerPkg.version), null, 2) + "\n");
  await write("README.md", readme({ sha, version: opts.version }));
  await write("SOURCE.md", sourceMd({ sha, version: opts.version }));
  await write(".gitignore", GITIGNORE);
  await cp(path.join(REPO, "LICENSE"), path.join(outDir, "LICENSE"));
  await mkdir(path.join(outDir, ".github/workflows"), { recursive: true });
  await write(".github/workflows/close-pull-requests.yml", CLOSE_PULL_REQUESTS);

  console.log(`✓ send0 ${opts.version} template from ${UPSTREAM}@${sha.slice(0, 12)} in ${outDir}`);
  console.log(`  worker modules: ${modules.join(", ")}`);
}

await main();
