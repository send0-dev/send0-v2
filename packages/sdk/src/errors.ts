/** Every non-2xx API response becomes a Send0Error with the API's code, message and request id. */
export class Send0Error extends Error {
  override readonly name = "Send0Error";
  constructor(
    message: string,
    /** HTTP status, or 0 for network errors and timeouts */
    readonly status: number,
    /** Stable code, e.g. "not_found", "recipient_not_allowed", "daily_limit_reached" */
    readonly code: string,
    readonly param?: string,
    readonly requestId?: string,
  ) {
    super(message);
  }
}
