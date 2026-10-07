import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SOURCES = new Set(["hero", "footer-cta", "pricing"]);

export const POST: APIRoute = async ({ request }) => {
  const wantsJson = (request.headers.get("accept") ?? "").includes("application/json");

  const reply = (ok: boolean, message: string, status: number) =>
    wantsJson
      ? Response.json({ ok, message }, { status })
      : Response.redirect(new URL(`/?waitlist=${ok ? "ok" : "error"}#waitlist`, request.url), 303);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply(false, "Send the form as multipart or URL-encoded data.", 400);
  }

  // Bots fill the hidden field. Pretend it worked so they move on.
  if (String(form.get("company") ?? "").trim() !== "") {
    return reply(true, "Thanks. We'll email you when the beta opens.", 200);
  }

  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return reply(false, "That email didn't look right. Try again.", 400);
  }

  const rawSource = String(form.get("source") ?? "");
  const source = SOURCES.has(rawSource) ? rawSource : null;
  const country = request.headers.get("cf-ipcountry");

  try {
    await env.WAITLIST_DB.prepare("INSERT INTO waitlist (email, source, country) VALUES (?1, ?2, ?3) ON CONFLICT(email) DO NOTHING")
      .bind(email, source, country)
      .run();
  } catch (err) {
    console.error("waitlist insert failed", err);
    return reply(false, "We couldn't save that right now. Try again in a minute.", 500);
  }

  return reply(true, "Thanks. We'll email you when the beta opens.", 200);
};
