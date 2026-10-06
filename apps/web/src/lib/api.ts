/** Errors from /auth/* and /api/* share one shape. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly field?: string
  ) {
    super(message);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(
      e.message ?? `Request failed (${res.status})`,
      res.status,
      e.code ?? "http_error",
      e.field ?? e.param
    );
  }
  return data as T;
}

export const http = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) =>
    request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: <T>(path: string) => request<T>("DELETE", path),
};

/** The public API, as the signed-in workspace. Same paths and JSON as api.send0.dev/v1. */
export const api = {
  get: <T>(path: string) => http.get<T>(`/api/v1${path}`),
  post: <T>(path: string, body?: unknown) =>
    http.post<T>(`/api/v1${path}`, body),
  patch: <T>(path: string, body: unknown) =>
    http.patch<T>(`/api/v1${path}`, body),
  del: <T>(path: string) => http.del<T>(`/api/v1${path}`),
};

export interface Me {
  id: string;
  email: string;
  name: string | null;
  email_verified: boolean;
  onboarded: boolean;
  org_id: string | null;
  org_name: string | null;
}

export interface List<T> {
  object: "list";
  data: T[];
  next_cursor: string | null;
}
export interface Mailbox {
  name: string | null;
  email: string;
}
export interface Inbox {
  id: string;
  address: string;
  local_part: string;
  display_name: string | null;
  send_policy: "open" | "reply_only" | "approval";
  status: string;
  created_at: string;
}
export interface Thread {
  id: string;
  subject: string;
  participants: string[];
  message_count: number;
  last_message_at: string;
}
export interface Message {
  id: string;
  thread_id: string;
  direction: "in" | "out";
  status: string;
  from: Mailbox | null;
  to: Mailbox[];
  cc: Mailbox[];
  subject: string;
  text: string | null;
  html?: string | null;
  extracted_text: string | null;
  extracted: {
    otp: string | null;
    links: string[];
    action_link: string | null;
  } | null;
  auth: { spf: string; dkim: string; dmarc: string } | null;
  safety: {
    prompt_injection: "none" | "suspected" | "likely";
    reasons: string[];
  } | null;
  attachments: {
    id: string;
    filename: string | null;
    content_type: string;
    size: number;
  }[];
  received_at: string | null;
  sent_at: string | null;
  created_at: string;
}
export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  mode: string;
  scopes: string[];
  inbox_ids: string[] | null;
  last_used_at: string | null;
  created_at: string;
  key?: string;
}
export interface Webhook {
  id: string;
  url: string;
  events: string[];
  inbox_ids: string[] | null;
  status: "enabled" | "disabled";
  created_at: string;
  secret?: string;
}
export interface Delivery {
  id: string;
  event_id: string;
  event_type: string | null;
  status: "pending" | "succeeded" | "failed";
  attempts: number;
  last_status_code: number | null;
  last_error: string | null;
  last_duration_ms: number | null;
  next_attempt_at: string | null;
  created_at: string;
}
export interface Draft {
  id: string;
  inbox_id: string;
  status: string;
  to: Mailbox[];
  subject: string;
  text: string | null;
  kind: string;
  created_at: string;
}
