import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, FormRootError } from "@/components/ui/form";
import { applyServerError } from "@/lib/form-errors";
import { useResetPassword } from "../api/use-auth-mutations";
import { newPassword } from "../schemas";

const schema = z.object({ password: newPassword, confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The passwords don't match." });
type Values = z.infer<typeof schema>;

export function ResetPasswordForm({ token, onDone }: { token: string; onDone: () => void }) {
  const reset = useResetPassword();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: "", confirm: "" } });
  const onSubmit = form.handleSubmit((v) => reset.mutate({ token, password: v.password }, { onSuccess: onDone, onError: (e) => applyServerError(form, e) }));
  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" autoFocus {...field} />
              </FormControl>
              <FormDescription>At least 10 characters.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormRootError />
        <Button type="submit" size="lg" loading={reset.isPending}>
          Set new password
        </Button>
      </form>
    </Form>
  );
}
