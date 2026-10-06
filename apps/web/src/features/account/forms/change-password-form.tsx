import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, FormRootError } from "@/components/ui/form";
import { newPassword } from "@/features/auth/schemas";
import { applyServerError } from "@/lib/form-errors";
import { useChangePassword } from "../api/use-account-mutations";

const schema = z
  .object({ current: z.string().min(1, "Enter your current password."), next: newPassword, confirm: z.string() })
  .refine((v) => v.next === v.confirm, { path: ["confirm"], message: "The passwords don't match." });
type Values = z.infer<typeof schema>;

export function ChangePasswordForm() {
  const change = useChangePassword();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { current: "", next: "", confirm: "" } });
  const onSubmit = form.handleSubmit((v) =>
    change.mutate(
      { current: v.current, next: v.next },
      {
        onSuccess: () => {
          form.reset();
          toast.success("Password changed. Other devices were signed out.");
        },
        onError: (e) => applyServerError(form, e),
      }
    )
  );
  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="grid max-w-sm gap-4" noValidate>
        <FormField
          control={form.control}
          name="current"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Current password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="next"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
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
              <FormLabel>Confirm new password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormRootError />
        <div>
          <Button variant="primary" type="submit" loading={change.isPending}>
            Change password
          </Button>
        </div>
      </form>
    </Form>
  );
}
