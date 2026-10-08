import { Send0Error } from "@send0/sdk";

/** Error text the model can read and act on (e.g. pick another recipient), instead of a crashed call. */
export function toolErrorText(err: unknown): string {
  return err instanceof Send0Error
    ? `send0 error ${err.code}: ${err.message}`
    : `Error: ${err instanceof Error ? err.message : String(err)}`;
}
