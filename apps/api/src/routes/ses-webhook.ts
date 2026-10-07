import { Hono } from "hono";
import { ApiError } from "../errors";
import { handleSesEvent, type SesEvent } from "../sending/ses-events";
import { verifySnsMessage } from "../sending/sns-signature";
import type { AppEnv } from "../types";

interface SnsEnvelope {
  Type: "SubscriptionConfirmation" | "Notification" | "UnsubscribeConfirmation";
  TopicArn: string;
  Message: string;
  SubscribeURL?: string;
}

const SNS_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com$/;

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * SNS → SES delivery events. Mounted outside /v1 (no API key): protected by a long random
 * token in the subscription URL, only our own topic is accepted, and every message must carry
 * a valid SNS signature before we act on it (including fetching a SubscribeURL).
 */
export const sesWebhookRoutes = new Hono<AppEnv>().post("/", async (c) => {
  const cfg = c.get("deps").sesEvents;
  if (!cfg || !timingSafeEqual(c.req.query("token") ?? "", cfg.token)) throw new ApiError(404, "route_not_found", "Not found.");

  let msg: SnsEnvelope;
  try {
    msg = JSON.parse(await c.req.text()) as SnsEnvelope;
  } catch {
    throw new ApiError(400, "invalid_request", "Expected an SNS JSON message.");
  }
  if (typeof msg !== "object" || msg === null) throw new ApiError(400, "invalid_request", "Expected an SNS JSON message.");
  if (msg.TopicArn !== cfg.topicArn) throw new ApiError(403, "forbidden", "Unexpected topic.");

  const now = c.get("deps").now;
  const verified = await (cfg.verify ?? ((m: unknown) => verifySnsMessage(m, { now })))(msg);
  if (!verified.ok) {
    console.warn(JSON.stringify({ event: "sns.signature_rejected", reason: verified.reason }));
    throw new ApiError(403, "forbidden", "Invalid SNS signature.");
  }

  if (msg.Type === "SubscriptionConfirmation") {
    const url = new URL(msg.SubscribeURL ?? "");
    if (url.protocol !== "https:" || !SNS_HOST.test(url.hostname)) throw new ApiError(400, "invalid_request", "Bad SubscribeURL.");
    const res = await fetch(url);
    console.log(JSON.stringify({ event: "sns.subscription_confirmed", topic: msg.TopicArn, status: res.status }));
    return c.json({ ok: res.ok });
  }
  if (msg.Type !== "Notification") return c.json({ ok: true });

  const evt = JSON.parse(msg.Message) as SesEvent;
  const result = await handleSesEvent(c.get("deps"), evt);
  return c.json({ ok: true, ...result });
});
