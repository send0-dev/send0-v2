import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Every error the API returns has the same shape:
 * { "error": { "code": "not_found", "message": "...", "param": "inbox_id", "request_id": "..." } }
 */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly param?: string,
    /** Response headers that go with the error, e.g. Retry-After on a 429 */
    readonly headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export const unauthorized = (message = "Missing or invalid API key. Send it as: Authorization: Bearer s0_live_…") =>
  new ApiError(401, "unauthorized", message);
export const forbidden = (message: string) => new ApiError(403, "forbidden", message);
export const notFound = (resource: string, id?: string) =>
  new ApiError(404, "not_found", id ? `No ${resource} with id ${id}.` : `${resource} not found.`);
export const invalid = (message: string, param?: string) => new ApiError(400, "invalid_request", message, param);
/** The message is past its inbox's retention period: its content and raw .eml are gone. */
export const messageExpired = (id: string) =>
  new ApiError(410, "message_expired", `Message ${id} is past its inbox's retention period; its content was deleted.`);
export const conflict = (code: string, message: string, param?: string) => new ApiError(409, code, message, param);

export function errorBody(c: Context, err: ApiError) {
  return {
    error: {
      code: err.code,
      message: err.message,
      ...(err.param ? { param: err.param } : {}),
      request_id: c.get("requestId") as string | undefined,
    },
  };
}
