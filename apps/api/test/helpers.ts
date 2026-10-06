import { newApiKey, newId } from "@send0/core";
import { schema, type Db } from "@send0/db";
import { createTestDb } from "@send0/db/testing";
import { createApp } from "../src/app";

export interface TestEnv {
  db: Db;
  app: ReturnType<typeof createApp>;
  orgId: string;
  adminKey: string;
  close: () => Promise<void>;
  /** Make an API key for the org with the given scopes/inboxes. */
  makeKey: (opts?: { scopes?: string[]; inboxIds?: string[] | null; orgId?: string }) => Promise<string>;
  call: (method: string, path: string, opts?: { key?: string | null; body?: unknown; headers?: Record<string, string> }) => Promise<{ status: number; body: any; headers: Headers }>;
}

export async function setup(opts: { now?: () => Date } = {}): Promise<TestEnv> {
  const { db, close } = await createTestDb();
  const orgId = newId("org");
  await db.insert(schema.orgs).values({ id: orgId, name: "Test org" });
  await db.insert(schema.domains).values({ id: "dom_shared", name: "send0.email", kind: "shared", status: "verified" });

  const makeKey: TestEnv["makeKey"] = async ({ scopes = ["admin"], inboxIds = null, orgId: org = orgId } = {}) => {
    const k = await newApiKey("live");
    await db.insert(schema.apiKeys).values({ id: newId("key"), orgId: org, name: "test", prefix: k.prefix, hash: k.hash, mode: "live", scopes, inboxIds });
    return k.key;
  };
  const adminKey = await makeKey();
  const app = createApp({
    db,
    now: opts.now,
    files: { signedGetUrl: async (key, o) => `https://files.test/${key}?expires=${o.expiresIn}&name=${encodeURIComponent(o.filename ?? "")}` },
  });

  const call: TestEnv["call"] = async (method, path, { key = adminKey, body, headers = {} } = {}) => {
    const res = await app.request(path, {
      method,
      headers: {
        ...(key ? { authorization: `Bearer ${key}` } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  };

  return { db, app, orgId, adminKey, close, makeKey, call };
}

import { newId as _newId, parseInbound } from "@send0/core";
import { findInboxByAddress, ingestMessage } from "@send0/pipeline";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const fixture = (n: string) =>
  readFileSync(fileURLToPath(new URL(`../../../fixtures/emails/${n}`, import.meta.url).href));

/** Runs a fixture .eml through the real inbound pipeline into the given inbox. */
export async function deliver(db: Db, address: string, raw: Uint8Array, at = new Date()) {
  const [local, domain] = address.split("@") as [string, string];
  const inbox = await findInboxByAddress(db, local, domain);
  if (!inbox) throw new Error(`no inbox ${address}`);
  const id = _newId("msg");
  return ingestMessage(db, { put: async () => {} }, {
    inbox,
    messageId: id,
    rawKey: `raw/${inbox.orgId}/${id}.eml`,
    parsed: await parseInbound(raw, { trustedAuthservIds: ["mx.cloudflare.net"] }),
    tag: null,
    receivedAt: at,
  });
}
