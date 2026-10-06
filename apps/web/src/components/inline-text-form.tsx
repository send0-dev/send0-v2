import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { applyServerError } from "@/lib/form-errors";

/**
 * One editable value in a settings row: the input, and a Save button that only appears once
 * something changed. Enter saves, Escape puts the old value back.
 */
export function InlineTextForm({
  value,
  label,
  schema,
  pending,
  disabled,
  placeholder,
  onSave,
}: {
  value: string;
  label: string;
  schema: z.ZodString;
  pending: boolean;
  disabled?: boolean;
  placeholder?: string;
  onSave: (value: string, onError: (e: unknown) => void) => void;
}) {
  const form = useForm<{ value: string }>({ resolver: zodResolver(z.object({ value: schema })), values: { value } });
  const dirty = form.formState.isDirty;
  const submit = form.handleSubmit((v) => onSave(v.value, (e) => applyServerError(form, e, { toastOtherwise: true })));
  return (
    <Form {...form}>
      <form onSubmit={submit} className="flex items-start gap-2" noValidate>
        <FormField
          control={form.control}
          name="value"
          render={({ field }) => (
            <FormItem className="w-60 max-sm:w-full">
              <FormControl>
                <Input {...field} aria-label={label} placeholder={placeholder} disabled={disabled} onKeyDown={(e) => e.key === "Escape" && form.reset()} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {dirty && (
          <Button variant="primary" type="submit" loading={pending} className="animate-enter">
            Save
          </Button>
        )}
      </form>
    </Form>
  );
}
