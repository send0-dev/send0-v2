import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormRootError } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { applyServerError } from "@/lib/form-errors";

export const workspaceNameSchema = z.object({ name: z.string().trim().min(2, "Use 2–60 characters.").max(60, "Use 2–60 characters.") });
type Values = z.infer<typeof workspaceNameSchema>;

/** One field, one button: used to create a workspace and to rename one. */
export function WorkspaceNameForm({
  defaultName = "",
  submitLabel,
  pending,
  onSubmit,
  disabled,
  autoFocus,
}: {
  defaultName?: string;
  submitLabel: string;
  pending: boolean;
  onSubmit: (name: string, onError: (e: unknown) => void) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const form = useForm<Values>({ resolver: zodResolver(workspaceNameSchema), defaultValues: { name: defaultName }, values: { name: defaultName } });
  const submit = form.handleSubmit((v) => onSubmit(v.name, (e) => applyServerError(form, e)));
  return (
    <Form {...form}>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Workspace name</FormLabel>
              <FormControl>
                <Input disabled={disabled} autoFocus={autoFocus} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormRootError />
        {!disabled && (
          <div>
            <Button type="submit" loading={pending} disabled={!form.formState.isDirty && !!defaultName}>
              {submitLabel}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
