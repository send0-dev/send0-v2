import type { FieldValues, Path, UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { toAppError } from "@/lib/api";

/**
 * Puts a failed request's error where it belongs: on the matching input when the server names
 * a field the form has, otherwise as the form's root error (or a toast when `toastOtherwise`).
 */
export function applyServerError<T extends FieldValues>(form: UseFormReturn<T>, err: unknown, opts: { toastOtherwise?: boolean } = {}) {
  const e = toAppError(err);
  const fields = Object.keys(form.getValues());
  if (e.field && fields.includes(e.field)) {
    form.setError(e.field as Path<T>, { type: "server", message: e.message }, { shouldFocus: true });
    return;
  }
  if (opts.toastOtherwise) toast.error(e.message);
  else form.setError("root.server", { type: "server", message: e.message });
}
