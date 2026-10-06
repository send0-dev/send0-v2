import { useState } from "react";
import { ApiError } from "./api";

/** Submit state with errors routed to the field the server named, or shown as a banner. */
export function useSubmit() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ApiError && err.field)
        setFieldErrors({ [err.field]: err.message });
      else
        setError(err instanceof Error ? err.message : "Something went wrong.");
      return undefined;
    } finally {
      setPending(false);
    }
  }
  return { pending, error, fieldErrors, run, setError };
}
