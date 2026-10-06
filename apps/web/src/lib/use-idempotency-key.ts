import { useCallback, useRef } from "react";

/**
 * One idempotency key per logical submission: the same key is reused if the person retries
 * after a failure (so the server never acts twice), and a new one starts after success.
 */
export function useIdempotencyKey() {
  const key = useRef<string | null>(null);
  const current = useCallback(() => (key.current ??= crypto.randomUUID()), []);
  const reset = useCallback(() => {
    key.current = null;
  }, []);
  return { current, reset };
}
