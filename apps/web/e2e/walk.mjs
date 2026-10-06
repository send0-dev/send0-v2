/**
 * End-to-end walk through the dashboard in a real browser, against the local dev server.
 *
 *   pnpm --filter @send0/web build
 *   pnpm --filter @send0/web exec tsx scripts/dev-server.ts 5199 &
 *   node e2e/walk.mjs [http://127.0.0.1:5199]
 *
 * Screenshots (light, dark, phone) go to e2e/shots/ (git-ignored). Exits non-zero on the first
 * failed step, or if the page logged errors other than the ones a step expects.
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] ?? "http://127.0.0.1:5199";
const OUT = fileURLToPath(new URL("./shots/", import.meta.url));
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
mkdirSync(OUT, { recursive: true });

const stamp = Date.now();
const owner = { name: "Olivia Owner", email: `olivia+${stamp}@example.com`, password: "tangerine-orbit-42" };
const teammate = { name: "Mia Member", email: `mia+${stamp}@example.com`, password: "lantern-cove-88" };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run"] });
const errors = [];
let expectedErrors = 0;
let shotNo = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPage(context) {
  const page = await context.newPage();
  await page.setViewport({ width: 1366, height: 860 });
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]); // screenshots toggle themes themselves
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`);
  });
  return page;
}

// ---------- helpers ----------
const api = (path, body) =>
  fetch(BASE + path, { method: body ? "POST" : "GET", headers: body ? { "content-type": "application/json" } : {}, body: body && JSON.stringify(body) }).then((r) => r.json());
const lastLink = async (to) => (await api(`/__dev/email?to=${encodeURIComponent(to)}`)).link;
const deliver = (to, fixture) => api("/__dev/deliver", { to, fixture });

/** Visible text of an element, minus keyboard-shortcut hints (<kbd>). Runs in the page. */
const LABEL_FN = `(el) => { const c = el.cloneNode(true); c.querySelectorAll("kbd").forEach((k) => k.remove()); return c.textContent.trim(); }`;

/** A real mouse click, falling back to a DOM click when Puppeteer can't find a clickable point. */
const press = async (handle) => {
  const el = handle.asElement();
  await el.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await el.click().catch(() => el.evaluate((e) => e.click()));
};

const h = (page) => ({
  goto: (path) => page.goto(BASE + path, { waitUntil: "domcontentloaded" }), // the inbox keeps a live event stream open, so the network never idles
  path: () => new URL(page.url()).pathname,
  waitPath: (re, timeout = 15000) => page.waitForFunction((src) => new RegExp(src).test(location.pathname), { timeout }, re.source),
  text: (t, timeout = 15000) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, t),
  noText: (t, timeout = 15000) => page.waitForFunction((t) => !document.body.innerText.includes(t), { timeout }, t),
  /** Fill the input whose <label> reads `label`. Waits out a dialog's opening animation, when there is one. */
  fill: async (label, value) => {
    if (await page.$("[role=dialog][data-state=open]")) await sleep(300);
    const id = await page.waitForFunction(
      (l) => [...document.querySelectorAll("label")].find((x) => x.textContent.trim() === l && x.htmlFor && document.getElementById(x.htmlFor))?.htmlFor,
      { timeout: 10000 },
      label
    );
    const sel = `[id="${await id.jsonValue()}"]`;
    await page.$eval(sel, (el) => {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
      setter.call(el, "");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.type(sel, value);
  },
  /** Click the first enabled button or link whose text is exactly `text` (optionally inside `scope`). Real mouse events. */
  click: async (text, scope = "body") => {
    const el = await page.waitForFunction(
      (t, s, fn) => {
        const label = eval(fn);
        return [...document.querySelectorAll(`${s} button, ${s} a, ${s} [role=menuitem], ${s} [role=option], ${s} [role=tab], ${s} [cmdk-item]`)].find((b) => label(b) === t && !b.disabled);
      },
      { timeout: 10000 },
      text,
      scope,
      LABEL_FN
    );
    await press(el);
  },
  /** Click the first button inside `scope` whose text contains `text`. */
  clickContaining: async (text, scope) => {
    const el = await page.waitForFunction(
      (t, s) => [...document.querySelectorAll(`${s} button, ${s} [role=menuitem]`)].find((b) => b.textContent.includes(t)),
      { timeout: 10000 },
      text,
      scope
    );
    await press(el);
  },
  /** Click the table row containing `text`. */
  clickRow: async (text) => {
    const el = await page.waitForFunction((t) => [...document.querySelectorAll("[role=list] button, tbody tr")].find((r) => r.textContent.includes(t)), { timeout: 10000 }, text);
    await press(el);
  },
  /** Wait until no dialog or sheet is open (including its closing animation). */
  dialogsClosed: () => page.waitForFunction(() => !document.querySelector("[role=dialog], [role=alertdialog]"), { timeout: 5000 }),
  shot: async (name) => {
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => document.documentElement.classList.toggle("dark", t === "dark"), theme);
      await sleep(250);
      await page.screenshot({ path: `${OUT}${String(++shotNo).padStart(2, "0")}-${name}-${theme}.png` });
    }
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
  },
});

let failed = false;
let current = null;
async function step(label, fn) {
  if (failed) return;
  try {
    await fn();
    console.log(`ok    ${label}`);
  } catch (e) {
    failed = true;
    console.log(`FAIL  ${label}\n      ${e.message.split("\n")[0]}`);
    await current?.screenshot({ path: `${OUT}FAIL.png` }).catch(() => {});
  }
}

// ---------- the owner's journey ----------
const ownerCtx = await browser.createBrowserContext();
const page = await newPage(ownerCtx);
const o = h(page);
current = page;
let inboxId, address;

await step("signed-out visitors land on login, keeping where they were going", async () => {
  await o.goto("/messages");
  await o.waitPath(/^\/login$/);
  if (!page.url().includes("next=%2Fmessages")) throw new Error(`expected ?next=/messages, got ${page.url()}`);
  await o.shot("login");
});

await step("sign-up rejects a throwaway address with the error on the field", async () => {
  await o.goto("/signup");
  await o.fill("Your name", owner.name);
  await o.fill("Work email", "x@mailinator.com");
  await o.fill("Password", owner.password);
  expectedErrors++;
  await o.click("Create account");
  await o.text("Temporary email addresses aren't accepted");
  await o.shot("signup-error");
});

await step("signs up and lands on check-email", async () => {
  await o.fill("Work email", owner.email);
  await o.click("Create account");
  await o.waitPath(/^\/check-email$/);
  await o.text(owner.email);
  await o.shot("check-email");
});

await step("the verification link opens onboarding", async () => {
  await o.goto(new URL(await lastLink(owner.email)).pathname + new URL(await lastLink(owner.email)).search);
  await o.waitPath(/^\/onboarding$/);
  await o.text("Name your workspace");
  await o.shot("onboarding-workspace");
});

await step("onboarding: workspace, inbox, key", async () => {
  await o.fill("Workspace name", "Acme");
  await o.click("Continue");
  await o.text("Create your first inbox");
  await o.shot("onboarding-inbox");
  await o.click("Create inbox");
  await o.text("Your API key");
  await o.click("Create API key");
  await o.text("only time you'll see the full API key");
  await o.shot("onboarding-key");
  await page.click("#saved-key");
  await o.click("Continue");
  await o.text("Waiting for your email");
});

await step("onboarding: an email arrives live, then the dashboard opens on the inbox", async () => {
  address = await page.$eval("code", (c) => c.textContent);
  await sleep(500);
  await deliver(address, "otp-subject.eml");
  await o.text("It arrived");
  await o.text("731902");
  await o.shot("onboarding-arrived");
  await o.click("Go to dashboard");
  await o.waitPath(/^\/inboxes\/ibx_/);
  inboxId = o.path().split("/")[2];
});

await step("inbox: threads list and a thread with extracted code and auth badges", async () => {
  for (const f of ["gmail-reply.eml", "injection-hidden.eml", "attachment-pdf.eml", "magic-link.eml"]) await deliver(address, f);
  await o.goto(`/inboxes/${inboxId}`);
  await o.text("Invoice #9921 attached");
  await o.shot("inbox");
  await o.clickContaining("Invoice #9921 attached", "ul[aria-label=Threads]");
  await o.text("Possible prompt injection");
  await o.shot("thread-injection");
  await o.clickContaining("Sign in to Acme", "ul[aria-label=Threads]");
  await o.text("DKIM");
  await o.shot("thread-magic-link");
});

await step("inbox: replying in-thread", async () => {
  await o.clickContaining("Re: PO #4471 delivery date", "ul[aria-label=Threads]");
  // The open thread (and its reply box) has switched once its heading shows the new subject.
  await page.waitForFunction(() => document.querySelector("section[aria-label=Conversation] h2")?.textContent === "Re: PO #4471 delivery date", { timeout: 10000 });
  await page.type("textarea", "Thanks Dana, Thursday works.");
  await o.click("Send");
  await o.text("Reply sent");
  await o.text("Thanks Dana, Thursday works.");
  await o.shot("thread-replied");
});

await step("inbox: new mail shows up live without reloading", async () => {
  await o.clickContaining("Sign in to Acme", "ul[aria-label=Threads]");
  await deliver(address, "calendar-invite.eml");
  await page.waitForFunction(() => document.querySelectorAll("ul[aria-label=Threads] li").length >= 6, { timeout: 15000 });
});

await step("inbox settings: switch to approval; a reply becomes a draft; approve it", async () => {
  await page.click("[aria-label='Inbox settings']");
  await o.text("Sending");
  await o.clickContaining("Needs approval", "[role=dialog]");
  await o.click("Save changes", "[role=dialog]");
  await o.text("Inbox saved");
  await o.dialogsClosed();
  await o.clickContaining("Re: PO #4471 delivery date", "ul[aria-label=Threads]");
  await page.waitForFunction(() => document.querySelector("section[aria-label=Conversation] h2")?.textContent === "Re: PO #4471 delivery date", { timeout: 10000 });
  await o.text("Thanks Dana, Thursday works.");
  await o.text("this becomes a draft");
  await page.type("textarea", "Second reply, needs a human.");
  await o.click("Save draft");
  await o.text("waiting for approval");
  await o.goto("/drafts");
  await o.text("Second reply, needs a human.");
  await o.shot("drafts");
  await o.click("Edit");
  await o.fill("Message", "Edited before approval.");
  await o.click("Save draft", "[role=dialog]");
  await o.text("Edited before approval.");
  await o.dialogsClosed();
  await o.click("Approve & send");
  await o.text("Sent “Re: PO #4471 delivery date”");
  await o.text("You're all caught up");
});

await step("messages log: filters in the URL and a detail sheet", async () => {
  await o.goto("/messages");
  await o.text("Invoice #9921 attached");
  await o.shot("messages");
  await page.type("[aria-label='Search messages']", "invoice");
  await page.waitForFunction(() => location.search.includes("q=invoice"), { timeout: 5000 });
  await o.noText("Sign in to Acme");
  await o.clickRow("Invoice #9921 attached");
  await o.text("Open thread");
  await o.click("Details", "[role=dialog]");
  await o.text("Message-ID");
  await o.shot("message-sheet");
  await page.keyboard.press("Escape");
});

await step("⌘K jumps to a page", async () => {
  await o.goto("/");
  await o.text("Mail volume");
  await page.keyboard.down("Meta");
  await page.keyboard.press("k");
  await page.keyboard.up("Meta");
  await page.waitForSelector("[cmdk-input]");
  await page.type("[cmdk-input]", "api keys");
  await o.shot("command-menu");
  await page.keyboard.press("Enter");
  await o.waitPath(/^\/api-keys$/);
  await o.dialogsClosed();
});

await step("API keys: create, reveal once, revoke", async () => {
  await o.text("Default key");
  await o.click("New key");
  await o.fill("Name", "Support agent");
  await o.clickContaining("Read only", "[role=dialog]");
  await o.click("Create key", "[role=dialog]");
  await o.text("Copy your new key");
  await o.shot("api-key-created");
  await o.click("Done");
  await o.dialogsClosed();
  await o.text("Support agent");
  await o.shot("api-keys");
  await page.click("[aria-label='Actions for Support agent']");
  await o.click("Revoke key");
  await o.click("Revoke key", "[role=alertdialog]");
  await o.text("Revoked Support agent");
});

await step("webhooks: add an endpoint, see the secret once, send a test event", async () => {
  await o.goto("/webhooks");
  await o.shot("webhooks-empty");
  await o.click("Add endpoint");
  await o.fill("Endpoint URL", "https://example.com/hooks/send0");
  await o.click("Add endpoint", "[role=dialog]");
  await o.text("Save your signing secret");
  await o.click("Done");
  await o.dialogsClosed();
  await o.waitPath(/^\/webhooks\/whk_/);
  await o.click("Send test event");
  await o.text("Test event sent");
  await o.shot("webhook");
});

await step("overview: usage, recent messages, checklist", async () => {
  await o.goto("/");
  await o.text("Mail volume");
  await o.text("Activity");
  await o.shot("overview");
});

let inviteLink;
await step("members: invite a teammate", async () => {
  await o.goto("/settings/members");
  await o.click("Invite");
  await o.fill("Email", teammate.email);
  await o.click("Send invitation", "[role=dialog]");
  await o.text(`Invitation sent to ${teammate.email}`);
  await o.text("Pending invitations");
  await o.shot("members");
  inviteLink = await lastLink(teammate.email);
});

// ---------- the teammate, in a separate browser profile ----------
const mateCtx = await browser.createBrowserContext();
const matePage = await newPage(mateCtx);
const m = h(matePage);

await step("teammate: accepts the invitation by signing up", async () => {
  current = matePage;
  await m.goto(new URL(inviteLink).pathname);
  await m.text("Join Acme");
  await m.shot("invite");
  await m.fill("Your name", teammate.name);
  await m.fill("Password", teammate.password);
  await m.click("Create account and join Acme");
  await m.waitPath(/^\/$/);
  await m.text("Member");
});

await step("teammate: sees mail but not keys or webhooks", async () => {
  const nav = await matePage.$eval("aside", (n) => n.innerText);
  if (nav.includes("API keys") || nav.includes("Webhooks")) throw new Error(`member nav shows admin pages: ${nav}`);
  await m.goto(`/inboxes/${inboxId}`);
  await m.text("threads"); // the inbox opened with its thread list
  expectedErrors++;
  await m.goto("/api-keys");
  await m.text("You don't have access to this");
  await m.shot("member-forbidden");
});

// ---------- back to the owner ----------
await step("owner: sees the teammate, and can create and switch workspaces", async () => {
  current = page;
  await o.goto("/settings/members");
  await o.text(teammate.email);
  await page.click("aside [aria-label*='Switch workspace']");
  await o.click("Create workspace");
  await o.fill("Workspace name", "Side project");
  await o.click("Create workspace", "[role=dialog]");
  await o.text("Switched to Side project");
  await o.text("Get set up");
  await o.dialogsClosed();
  await page.click("aside [aria-label*='Switch workspace']");
  await o.clickContaining("Acme", "[role=menu]");
  await o.text("Mail volume");
});

await step("account: rename yourself", async () => {
  await o.goto("/settings/account");
  const nameInput = await page.waitForSelector("[aria-label='Your name']");
  await nameInput.click({ clickCount: 3 });
  await nameInput.type("Olivia O.");
  await o.click("Save");
  await o.text("Profile saved");
  await o.shot("account");
});

await step("log out, then log back in straight to the page you wanted", async () => {
  await page.click("aside [aria-label='Account menu']");
  await o.click("Log out");
  await o.waitPath(/^\/login$/);
  await o.goto("/drafts");
  await o.waitPath(/^\/login$/);
  await o.fill("Email", owner.email);
  await o.fill("Password", owner.password);
  await o.click("Log in");
  await o.waitPath(/^\/drafts$/);
});

await step("phone width", async () => {
  await page.setViewport({ width: 400, height: 860 });
  await o.goto(`/inboxes/${inboxId}`);
  await o.text("threads");
  await o.shot("phone-inbox");
  await page.click("[aria-label='Open menu']");
  await o.text("Documentation");
  await o.shot("phone-menu");
});

await browser.close();
const unexpected = errors.length - expectedErrors;
if (errors.length) console.log(`\npage errors (${expectedErrors} expected):\n  ${errors.join("\n  ")}`);
console.log(failed ? "\nFAILED" : unexpected > 0 ? "\nPASSED WITH UNEXPECTED ERRORS" : "\nPASSED");
process.exit(failed || unexpected > 0 ? 1 : 0);
