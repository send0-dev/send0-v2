export type AuthErrorStatus = 400 | 401 | 403 | 404 | 409 | 410 | 429 | 502;

/** A failure the dashboard shows to the user. `field` names the form input it belongs to. */
export class AuthError extends Error {
  constructor(
    readonly status: AuthErrorStatus,
    readonly code: string,
    message: string,
    readonly field?: string
  ) {
    super(message);
  }
}

export const unauthorized = () =>
  new AuthError(401, "unauthorized", "Log in to continue.");
export const forbidden = (message = "You don't have permission to do that.") =>
  new AuthError(403, "forbidden", message);
export const notFound = (what: string) =>
  new AuthError(404, "not_found", `That ${what} doesn't exist or isn't yours.`);
