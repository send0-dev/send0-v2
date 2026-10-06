import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, FormRootError } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { newPassword } from "@/features/auth/schemas";
import { applyServerError } from "@/lib/form-errors";
import { useInviteSignUp } from "../api/use-invite";

const schema = z.object({ name: z.string().trim().min(1, "Enter your name.").max(80), password: newPassword });
type Values = z.infer<typeof schema>;

/** Account creation for someone invited by email. The address is fixed to the invited one. */
export function InviteSignupForm({ token, email, workspace }: { token: string; email: string; workspace: string }) {
  const signUp = useInviteSignUp(token);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "", password: "" } });
  const onSubmit = form.handleSubmit((v) => signUp.mutate(v, { onError: (e) => applyServerError(form, e) }));
  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <div className="grid gap-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" value={email} disabled readOnly />
        </div>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your name</FormLabel>
              <FormControl>
                <Input autoComplete="name" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
              </FormControl>
              <FormDescription>At least 10 characters.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormRootError />
        <Button type="submit" size="lg" loading={signUp.isPending || signUp.isSuccess}>
          Create account and join {workspace}
        </Button>
      </form>
    </Form>
  );
}
