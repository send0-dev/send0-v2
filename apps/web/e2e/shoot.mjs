/**
 * Screenshots of one page for design review, at desktop, laptop and phone widths, light and dark.
 *
 *   node e2e/shoot.mjs /            → e2e/shots/review/<name>-<width>-<theme>.png
 *   node e2e/shoot.mjs /messages messages
 *
 * Signs up a fresh account on the local dev server, finishes onboarding and delivers some mail first.
 */
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE ?? "http://127.0.0.1:5199";
const [path = "/", name = path.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "overview"] = process.argv.slice(2);
const OUT = fileURLToPath(new URL("./shots/review/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const email = `review+${Date.now()}@example.com`;
let cookie = "";
const call = async (method, p, body) => {
  const r = await fetch(BASE + p, {
    method,
    headers: { origin: BASE, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body && JSON.stringify(body),
  });
  const set = r.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return r.json().catch(() => null);
};
await call("POST", "/auth/signup", { name: "Olivia Owner", email, password: "tangerine-orbit-42" });
const link = (await (await fetch(`${BASE}/__dev/email?to=${encodeURIComponent(email)}`)).json()).link;
await call("POST", "/auth/verify-email", { token: new URL(link).searchParams.get("token") });
await call("POST", "/auth/workspace", { name: "Acme" });
const inbox = await call("POST", "/api/v1/inboxes", { name: `support-${Date.now().toString(36)}`, display_name: "Support agent" });
await call("POST", "/api/v1/inboxes", { name: `signup-${Date.now().toString(36)}` });
await call("POST", "/api/v1/api-keys", { name: "Default key", scopes: ["read", "send"] });
await call("POST", "/auth/onboarding/finish");
for (const f of [
  "otp-subject.eml",
  "gmail-reply.eml",
  "injection-hidden.eml",
  "attachment-pdf.eml",
  "magic-link.eml",
  "calendar-invite.eml",
]) {
  await fetch(`${BASE}/__dev/deliver`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to: inbox.address, fixture: f }),
  });
}

// One sent reply and one draft waiting for approval, so Inbox, Messages and Drafts all have content.
const threads = await call("GET", `/api/v1/inboxes/${inbox.id}/threads`);
const dana = (await call("GET", `/api/v1/inboxes/${inbox.id}/messages?from=dana@gmail.com`)).data[0];
await call("POST", `/api/v1/messages/${dana.id}/reply`, { text: "Thanks Dana, Thursday works for us." });
await call("PATCH", `/api/v1/inboxes/${inbox.id}`, { send_policy: "approval" });
await call("POST", `/api/v1/messages/${dana.id}/reply`, {
  text: "Following up: can you confirm the delivery window is 9–11am?\n\nThanks,\nSupport agent",
});
const hook = await call("POST", "/api/v1/webhooks", { url: "https://hooks.example.com/send0/events" });
await call("POST", `/api/v1/webhooks/${hook.id}/test`);
await call("POST", "/api/v1/api-keys", { name: "Signup agent", scopes: ["read"], inbox_ids: [inbox.id] });
await call("POST", "/auth/invites", { email: "mia@example.com", role: "member" });
const threadId = threads.data.find((t) => t.subject.includes("PO #4471"))?.id ?? threads.data[0].id;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
// ANON=1 shoots signed-out pages (login, sign-up, …).
if (process.env.ANON !== "1") await page.setCookie({ name: cookie.split("=")[0], value: cookie.split("=").slice(1).join("="), url: BASE });
for (const [w, h] of [
  [1440, 900],
  [1180, 820],
  [400, 860],
]) {
  await page.setViewport({ width: w, height: h });
  for (const theme of ["light", "dark"]) {
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]);
    await page.goto(BASE + path.replace(":inbox", inbox.id).replace(":thread", threadId).replace(":webhook", hook.id), {
      waitUntil: "domcontentloaded",
    });
    await new Promise((r) => setTimeout(r, 1800));
    // The panel scrolls internally. For scrolling pages (FULL=1) let it grow so the capture shows
    // everything; split views (inbox, drafts) are captured as the viewport the person sees.
    if (process.env.FULL === "1") {
      await page.addStyleTag({
        content: "html,body,#root,main,main>div{height:auto!important;overflow:visible!important} .h-dvh{height:auto!important}",
      });
      await new Promise((r) => setTimeout(r, 200));
    }
    await page.screenshot({ path: `${OUT}${name}-${w}-${theme}.png`, fullPage: process.env.FULL === "1" });
  }
}
await browser.close();
console.log(`saved ${OUT}${name}-*.png`);
