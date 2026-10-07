import { forwardSubject, replyReferences, replySubject } from "@send0/core";
import { schema, type MailboxJson } from "@send0/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { loadInbox, loadMessage } from "../access";
import { requireApprover, requireScope } from "../auth";
import { ApiError, conflict, invalid, notFound } from "../errors";
import { listQuery, pageOrder, pageWhere, toPage } from "../pagination";
import { send, serializeDraft, type SendPayload, type SendResult } from "../sending/service";
import type { AppEnv } from "../types";
import { validate } from "../validation";

const { drafts, inboxes, domains } = schema;

const address = z.union([
  z.email().transform((email) => ({ name: null, email: email.toLowerCase() })),
  z
    .object({ email: z.email().transform((e) => e.toLowerCase()), name: z.string().trim().max(100).nullable().optional() })
    .transform((a) => ({ name: a.name ?? null, email: a.email })),
]);
const addressList = z.union([address.transform((a) => [a]), z.array(address).max(50)]);

const body = {
  text: z.string().max(500_000).optional(),
  html: z.string().max(1_000_000).optional(),
};
const hasBody = (b: { text?: string; html?: string }) => !!(b.text?.trim() || b.html?.trim());

export const sendBody = z
  .object({ to: addressList, cc: addressList.optional(), bcc: addressList.optional(), subject: z.string().trim().min(1).max(998), ...body })
  .refine(hasBody, { message: "send text, html or both", path: ["text"] });

export const replyBody = z
  .object({ reply_all: z.boolean().default(false), cc: addressList.optional(), bcc: addressList.optional(), ...body })
  .refine(hasBody, { message: "send text, html or both", path: ["text"] });

export const forwardBody = z.object({ to: addressList, cc: addressList.optional(), bcc: addressList.optional(), ...body });

export const draftListQuery = listQuery.extend({ status: z.enum(["pending", "approved", "rejected", "sent"]).optional() });
export const orgDraftListQuery = draftListQuery.extend({ inbox_id: z.string().max(40).optional() });

export const draftUpdateBody = z
  .object({
    subject: z.string().trim().min(1).max(998).optional(),
    text: z.string().max(500_000).nullable().optional(),
    html: z.string().max(1_000_000).nullable().optional(),
  })
  .refine((b) => b.subject !== undefined || b.text !== undefined || b.html !== undefined, { message: "change subject, text or html" });

function respond(c: Context<AppEnv>, r: SendResult) {
  return r.kind === "draft" ? c.json(r.draft, 202) : c.json(r.message, 201);
}

const dedupe = (list: MailboxJson[], exclude: string) => {
  const seen = new Set([exclude.toLowerCase()]);
  return list.filter((m) => !seen.has(m.email.toLowerCase()) && seen.add(m.email.toLowerCase()));
};

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

/** Mounted at /v1/inboxes/:inboxId/messages (POST) */
export const inboxSendRoutes = new Hono<AppEnv>().post("/", validate("json", sendBody), async (c) => {
  const auth = c.get("auth");
  requireScope(auth, "send");
  const { inbox, domain } = await loadInbox(c, c.req.param("inboxId")!);
  const b = c.req.valid("json");
  const payload: SendPayload = {
    kind: "new",
    to: b.to,
    cc: b.cc ?? [],
    bcc: b.bcc ?? [],
    subject: b.subject,
    text: b.text ?? null,
    html: b.html ?? null,
    threadId: null,
    inReplyTo: null,
    references: [],
    parentMessageId: null,
  };
  return respond(c, await send(c.get("deps"), auth, inbox, domain, payload));
});

/** Mounted at /v1/messages (POST /:id/reply, /:id/forward) */
export const messageSendRoutes = new Hono<AppEnv>()
  .post("/:id/reply", validate("json", replyBody), async (c) => {
    const auth = c.get("auth");
    requireScope(auth, "send");
    const parent = await loadMessage(c, c.req.param("id"));
    const { inbox, domain } = await loadInbox(c, parent.inboxId);
    const self = `${inbox.localPart}@${domain}`;
    const b = c.req.valid("json");

    // Reply to whoever the parent came from (Reply-To wins); replying to our own message goes to its recipients.
    const primary = parent.direction === "in" ? (parent.replyTo.length ? parent.replyTo : parent.from ? [parent.from] : []) : parent.to;
    const others = b.reply_all ? [...(parent.direction === "in" ? parent.to : []), ...parent.cc] : [];
    const to = dedupe(primary, self);
    if (!to.length) throw invalid("The original message has no address to reply to.");
    const cc = dedupe([...others, ...(b.cc ?? [])], self).filter((m) => !to.some((t) => t.email === m.email));

    return respond(
      c,
      await send(c.get("deps"), auth, inbox, domain, {
        kind: "reply",
        to,
        cc,
        bcc: b.bcc ?? [],
        subject: replySubject(parent.subject || "(no subject)"),
        text: b.text ?? null,
        html: b.html ?? null,
        threadId: parent.threadId,
        inReplyTo: parent.rfcMessageId,
        references: replyReferences(parent.references, parent.rfcMessageId),
        parentMessageId: parent.id,
      }),
    );
  })

  .post("/:id/forward", validate("json", forwardBody), async (c) => {
    const auth = c.get("auth");
    requireScope(auth, "send");
    const parent = await loadMessage(c, c.req.param("id"));
    const { inbox, domain } = await loadInbox(c, parent.inboxId);
    const b = c.req.valid("json");

    const fmt = (m: MailboxJson | null) => (m ? (m.name ? `${m.name} <${m.email}>` : m.email) : "");
    const header = [
      "---------- Forwarded message ---------",
      `From: ${fmt(parent.from)}`,
      `Date: ${(parent.receivedAt ?? parent.sentAt ?? parent.createdAt).toUTCString()}`,
      `Subject: ${parent.subject}`,
      `To: ${parent.to.map(fmt).join(", ")}`,
    ];
    const text = `${b.text ? `${b.text}\n\n` : ""}${header.join("\n")}\n\n${parent.text ?? ""}`;
    const html = `${b.html ?? (b.text ? `<p>${escapeHtml(b.text).replace(/\n/g, "<br>")}</p>` : "")}<div>${header.map(escapeHtml).join("<br>")}</div><br>${parent.html ?? `<pre>${escapeHtml(parent.text ?? "")}</pre>`}`;

    return respond(
      c,
      await send(c.get("deps"), auth, inbox, domain, {
        kind: "forward",
        to: b.to,
        cc: b.cc ?? [],
        bcc: b.bcc ?? [],
        subject: forwardSubject(parent.subject || "(no subject)"),
        text,
        html,
        threadId: null,
        inReplyTo: null,
        references: [],
        parentMessageId: parent.id,
      }),
    );
  });

/** Mounted at /v1/inboxes/:inboxId/drafts */
export const inboxDraftRoutes = new Hono<AppEnv>().get("/", validate("query", draftListQuery), async (c) => {
  requireScope(c.get("auth"), "read");
  const { inbox } = await loadInbox(c, c.req.param("inboxId")!);
  const { limit, cursor, status } = c.req.valid("query");
  const rows = await c
    .get("deps")
    .db.select()
    .from(drafts)
    .where(
      and(eq(drafts.inboxId, inbox.id), status ? eq(drafts.status, status) : undefined, pageWhere(cursor, drafts.createdAt, drafts.id)),
    )
    .orderBy(...pageOrder(drafts.createdAt, drafts.id))
    .limit(limit + 1);
  return c.json(toPage(rows, limit, (d) => ({ at: d.createdAt, id: d.id }), serializeDraft));
});

async function loadDraft(c: Context<AppEnv>, id: string) {
  const auth = c.get("auth");
  const [row] = await c
    .get("deps")
    .db.select()
    .from(drafts)
    .where(and(eq(drafts.id, id), eq(drafts.orgId, auth.orgId)));
  if (!row) throw notFound("draft", id);
  await loadInbox(c, row.inboxId); // enforces key inbox scope
  return row;
}

/** Mounted at /v1/drafts. Approving or rejecting needs a person or an admin key (see requireApprover). */
export const draftRoutes = new Hono<AppEnv>()
  .get("/", validate("query", orgDraftListQuery), async (c) => {
    const auth = c.get("auth");
    requireScope(auth, "read");
    const { limit, cursor, status, inbox_id } = c.req.valid("query");
    if (inbox_id) await loadInbox(c, inbox_id);
    const rows = await c
      .get("deps")
      .db.select({ draft: drafts })
      .from(drafts)
      .innerJoin(inboxes, eq(inboxes.id, drafts.inboxId))
      .where(
        and(
          eq(drafts.orgId, auth.orgId),
          isNull(inboxes.deletedAt),
          inbox_id ? eq(drafts.inboxId, inbox_id) : undefined,
          auth.inboxIds ? inArray(drafts.inboxId, auth.inboxIds.length ? auth.inboxIds : [""]) : undefined,
          status ? eq(drafts.status, status) : undefined,
          pageWhere(cursor, drafts.createdAt, drafts.id),
        ),
      )
      .orderBy(...pageOrder(drafts.createdAt, drafts.id))
      .limit(limit + 1)
      .then((r) => r.map((x) => x.draft));
    return c.json(toPage(rows, limit, (d) => ({ at: d.createdAt, id: d.id }), serializeDraft));
  })

  .get("/:id", async (c) => {
    requireScope(c.get("auth"), "read");
    return c.json(serializeDraft(await loadDraft(c, c.req.param("id"))));
  })

  // Edit a pending draft before approving it. Same rule as approving: an agent can't change
  // what's waiting for review after a person has looked at it.
  .patch("/:id", validate("json", draftUpdateBody), async (c) => {
    const auth = c.get("auth");
    requireApprover(auth);
    const draft = await loadDraft(c, c.req.param("id"));
    if (draft.status !== "pending") throw conflict("draft_decided", `This draft is already ${draft.status}.`);
    const b = c.req.valid("json");
    const payload = draft.payload as unknown as SendPayload;
    const next: SendPayload = {
      ...payload,
      ...(b.subject !== undefined ? { subject: b.subject } : {}),
      ...(b.text !== undefined ? { text: b.text } : {}),
      ...(b.html !== undefined ? { html: b.html } : {}),
    };
    if (!next.text?.trim() && !next.html?.trim()) throw new ApiError(400, "invalid_request", "A draft needs text, html or both.", "text");
    const [row] = await c
      .get("deps")
      .db.update(drafts)
      .set({ payload: next as unknown as Record<string, unknown> })
      .where(and(eq(drafts.id, draft.id), eq(drafts.status, "pending")))
      .returning();
    if (!row) throw conflict("draft_decided", "This draft was just decided.");
    return c.json(serializeDraft(row));
  })

  .post("/:id/send", async (c) => {
    const auth = c.get("auth");
    requireApprover(auth);
    const draft = await loadDraft(c, c.req.param("id"));
    const { db, now = () => new Date() } = c.get("deps");
    // Claim it first, so two people approving at once can't both send it.
    const [claimed] = await db
      .update(drafts)
      .set({ status: "approved", decidedBy: auth.keyId, decidedAt: now() })
      .where(and(eq(drafts.id, draft.id), eq(drafts.status, "pending")))
      .returning();
    if (!claimed) throw conflict("draft_decided", `This draft is already ${(await loadDraft(c, draft.id)).status}.`);
    const [row] = await db
      .select({ inbox: inboxes, domain: domains.name })
      .from(inboxes)
      .innerJoin(domains, eq(domains.id, inboxes.domainId))
      .where(eq(inboxes.id, draft.inboxId));
    let result: SendResult;
    try {
      result = await send(c.get("deps"), auth, row!.inbox, row!.domain, claimed.payload as unknown as SendPayload, { approved: true });
    } catch (err) {
      // Not sent (policy, limits, provider): back to the queue so someone can try again.
      await db.update(drafts).set({ status: "pending", decidedBy: null, decidedAt: null }).where(eq(drafts.id, draft.id));
      throw err;
    }
    await db.update(drafts).set({ status: "sent" }).where(eq(drafts.id, draft.id));
    return respond(c, result);
  })

  .post("/:id/reject", async (c) => {
    const auth = c.get("auth");
    requireApprover(auth);
    const draft = await loadDraft(c, c.req.param("id"));
    const { db, now = () => new Date() } = c.get("deps");
    const [row] = await db
      .update(drafts)
      .set({ status: "rejected", decidedBy: auth.keyId, decidedAt: now() })
      .where(and(eq(drafts.id, draft.id), eq(drafts.status, "pending")))
      .returning();
    if (!row) throw conflict("draft_decided", `This draft is already ${(await loadDraft(c, draft.id)).status}.`);
    return c.json(serializeDraft(row));
  });
