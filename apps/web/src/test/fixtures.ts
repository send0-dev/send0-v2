import type { ApiKey, Inbox, Message, ThreadWithMessages } from "@send0/sdk";
import type { Me } from "@/lib/auth-client";
import type { Role } from "@/lib/permissions";

const at = "2026-10-06T10:00:00.000Z";

export const me = (role: Role = "owner"): Me => ({
  user: { id: "usr_1", email: "olivia@acme.com", name: "Olivia", email_verified: true, onboarded: true },
  workspace: { id: "org_1", name: "Acme", role },
  workspaces: [{ id: "org_1", name: "Acme", role }],
});

export const inbox = (over: Partial<Inbox> = {}): Inbox => ({
  object: "inbox",
  id: "ibx_1",
  address: "agent@send0.email",
  local_part: "agent",
  domain: "send0.email",
  display_name: null,
  mode: "live",
  send_policy: "reply_only",
  status: "active",
  retention_days: 30,
  metadata: {},
  expires_at: null,
  created_at: at,
  updated_at: at,
  ...over,
});

export const message = (over: Partial<Message> = {}): Message => ({
  object: "message",
  id: "msg_1",
  inbox_id: "ibx_1",
  thread_id: "thr_1",
  direction: "in",
  status: "received",
  rfc_message_id: "<a@acme.dev>",
  in_reply_to: [],
  references: [],
  from: { name: "Dana", email: "dana@acme.dev" },
  to: [{ name: null, email: "agent@send0.email" }],
  cc: [],
  reply_to: [],
  subject: "Your code",
  text: "Your code is 482913",
  extracted_text: "Your code is 482913",
  extracted: { otp: "482913", links: [], action_link: null },
  auth: { spf: "pass", dkim: "pass", dmarc: "pass" },
  safety: { prompt_injection: "none", reasons: [] },
  tag: null,
  attachments: [],
  size: 1200,
  sent_at: null,
  received_at: at,
  created_at: at,
  ...over,
});

export const thread = (messages: Message[] = [message()]): ThreadWithMessages => ({
  object: "thread",
  id: "thr_1",
  inbox_id: "ibx_1",
  subject: messages[0]?.subject ?? "",
  participants: ["dana@acme.dev", "agent@send0.email"],
  message_count: messages.length,
  labels: [],
  last_message_at: at,
  created_at: at,
  messages,
});

export const apiKey = (over: Partial<ApiKey> = {}): ApiKey => ({
  object: "api_key",
  id: "key_1",
  name: "Default key",
  prefix: "s0_live_AbCd",
  mode: "live",
  scopes: ["read", "send"],
  inbox_ids: null,
  last_used_at: null,
  created_at: at,
  ...over,
});

export const list = <T,>(data: T[]) => ({ object: "list" as const, data, next_cursor: null });
