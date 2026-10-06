import SwaggerParser from "@apidevtools/swagger-parser";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import * as S from "../src/openapi/schemas";
import { buildOpenApi, operations } from "../src/openapi/spec";
import { deliver, fixture, setup, type TestEnv } from "./helpers";

const norm = (p: string) => p.replace(/:\w+/g, "{}").replace(/\{\w+\}/g, "{}");

describe("OpenAPI document", () => {
  it("is a valid OpenAPI 3.1 document", async () => {
    const doc = buildOpenApi();
    await expect(SwaggerParser.validate(structuredClone(doc) as never)).resolves.toBeTruthy();
    expect(doc.openapi).toBe("3.1.0");
    expect(new Set(operations.map((o) => o.operationId)).size).toBe(operations.length);
  });

  it("documents exactly the routes the app serves", async () => {
    const t = await setup();
    const served = new Set(
      t.app.routes
        .filter((r) => ["GET", "POST", "PATCH", "DELETE"].includes(r.method) && r.path.startsWith("/v1/"))
        .map((r) => `${r.method.toLowerCase()} ${norm(r.path)}`),
    );
    const documented = new Set(operations.map((o) => `${o.method} ${norm(o.path)}`));
    expect([...served].filter((r) => !documented.has(r)), "served but undocumented").toEqual([]);
    expect([...documented].filter((r) => !served.has(r)), "documented but not served").toEqual([]);
    await t.close();
  });

  it("is served publicly at /openapi.json", async () => {
    const t = await setup();
    const r = await t.call("GET", "/openapi.json", { key: null });
    expect(r.status).toBe(200);
    expect(r.body.paths["/v1/inboxes/{inbox_id}/messages/wait"].get.operationId).toBe("waitForMessage");
    expect(r.body.components.schemas.Message.properties.extracted).toBeTruthy();
    await t.close();
  });
});

/** Real responses must match the documented schemas exactly (strict objects: no extra or missing fields). */
describe("responses match the spec", () => {
  let t: TestEnv;
  const outbox: unknown[] = [];
  const check = <T extends z.ZodType>(schema: T, body: unknown) => {
    const r = schema.safeParse(body);
    if (!r.success) throw new Error(JSON.stringify(r.error.issues.slice(0, 3), null, 2));
    return r.data as z.infer<T>;
  };

  beforeAll(async () => {
    t = await setup({ mailer: { sendRaw: async (i) => (outbox.push(i), { providerMessageId: "ses-1" }) }, queue: { send: async () => {} } });
  });
  afterAll(() => t.close());

  it("covers the main flows", async () => {
    const inbox = check(S.Inbox, (await t.call("POST", "/v1/inboxes", { body: { name: "spec-agent", metadata: { team: "x" } } })).body);
    check(S.InboxList, (await t.call("GET", "/v1/inboxes")).body);
    check(S.Inbox, (await t.call("PATCH", `/v1/inboxes/${inbox.id}`, { body: { display_name: "Spec" } })).body);

    await deliver(t.db, "spec-agent@send0.email", fixture("attachment-pdf.eml"));
    await deliver(t.db, "spec-agent@send0.email", fixture("gmail-reply.eml"));
    const list = check(S.MessageList, (await t.call("GET", `/v1/inboxes/${inbox.id}/messages`)).body);
    const withAtt = list.data.find((m) => m.attachments.length)!;
    check(S.Message, (await t.call("GET", `/v1/messages/${withAtt.id}`)).body);
    check(S.AttachmentDownload, (await t.call("GET", `/v1/messages/${withAtt.id}/attachments/${withAtt.attachments[0]!.id}`)).body);
    check(S.WaitResult, (await t.call("GET", `/v1/inboxes/${inbox.id}/messages/wait?timeout=1`)).body);

    const threads = check(S.ThreadList, (await t.call("GET", `/v1/inboxes/${inbox.id}/threads`)).body);
    check(S.ThreadWithMessages, (await t.call("GET", `/v1/inboxes/${inbox.id}/threads/${threads.data[0]!.id}?include_html=true`)).body);

    const dana = list.data.find((m) => m.from?.email === "dana@gmail.com")!;
    check(S.Message, (await t.call("POST", `/v1/messages/${dana.id}/reply`, { body: { text: "ok" } })).body);
    check(S.Message, (await t.call("POST", `/v1/inboxes/${inbox.id}/messages`, { body: { to: "dana@gmail.com", subject: "s", text: "t" } })).body);

    await t.call("PATCH", `/v1/inboxes/${inbox.id}`, { body: { send_policy: "approval" } });
    const draft = check(S.Draft, (await t.call("POST", `/v1/messages/${dana.id}/forward`, { body: { to: "dana@gmail.com" } })).body);
    check(S.DraftList, (await t.call("GET", `/v1/inboxes/${inbox.id}/drafts`)).body);
    check(S.Draft, (await t.call("GET", `/v1/drafts/${draft.id}`)).body);
    check(S.Message, (await t.call("POST", `/v1/drafts/${draft.id}/send`)).body);

    const hook = check(S.WebhookWithSecret, (await t.call("POST", "/v1/webhooks", { body: { url: "https://example.com/h" } })).body);
    check(S.WebhookList, (await t.call("GET", "/v1/webhooks")).body);
    check(S.Webhook, (await t.call("PATCH", `/v1/webhooks/${hook.id}`, { body: { status: "disabled" } })).body);
    check(S.WebhookTestResult, (await t.call("POST", `/v1/webhooks/${hook.id}/test`)).body);
    const deliveries = check(S.DeliveryList, (await t.call("GET", `/v1/webhooks/${hook.id}/deliveries`)).body);
    check(S.Delivery, (await t.call("POST", `/v1/webhooks/${hook.id}/deliveries/${deliveries.data[0]!.id}/retry`)).body);
    check(S.WebhookWithSecret, (await t.call("POST", `/v1/webhooks/${hook.id}/rotate-secret`)).body);
    check(S.DeletedWebhook, (await t.call("DELETE", `/v1/webhooks/${hook.id}`)).body);

    const key = check(S.ApiKeyWithSecret, (await t.call("POST", "/v1/api-keys", { body: { name: "k" } })).body);
    check(S.ApiKeyList, (await t.call("GET", "/v1/api-keys")).body);
    check(S.RevokedApiKey, (await t.call("DELETE", `/v1/api-keys/${key.id}`)).body);

    check(S.ErrorBody, (await t.call("GET", "/v1/inboxes/ibx_nope")).body);
    check(S.DeletedInbox, (await t.call("DELETE", `/v1/inboxes/${inbox.id}`)).body);
  });
});

describe("committed openapi.json", () => {
  it("is up to date (run `pnpm --filter @send0/api openapi` after API changes)", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const committed = JSON.parse(readFileSync(fileURLToPath(new URL("../../../packages/sdk/openapi.json", import.meta.url).href), "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(buildOpenApi())));
  });
});
