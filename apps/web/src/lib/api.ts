import { Send0, Send0Error } from "@send0/sdk";
import { workspaceHeaders } from "@/lib/active-workspace";

/**
 * The typed send0 client, pointed at the dashboard Worker's /api proxy. The session cookie
 * authenticates, so no API key is sent. Retries are left to TanStack Query (reads only).
 */
export const send0 = new Send0({
  apiKey: null,
  baseUrl: `${location.origin}/api`,
  maxRetries: 0,
  fetch: (input, init) => {
    const headers = new Headers(init?.headers);
    for (const [k, v] of Object.entries(workspaceHeaders())) headers.set(k, v);
    return fetch(input, { ...init, headers, credentials: "same-origin" });
  },
});

/** One error shape for everything the app calls: the API (via the SDK) and /auth/*. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** The request field the error is about, when there is one */
    readonly field?: string,
  ) {
    super(message);
  }
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Send0Error) return new AppError(err.status, err.code, err.message, err.param ?? undefined);
  if (err instanceof TypeError) return new AppError(0, "network_error", "Can't reach send0. Check your connection and try again.");
  return new AppError(0, "unknown", err instanceof Error ? err.message : "Something went wrong.");
}

export const errorMessage = (err: unknown) => toAppError(err).message;
