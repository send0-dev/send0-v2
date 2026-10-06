import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PasswordInput } from "@/components/password-input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, FormRootError } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { applyServerError } from "@/lib/form-errors";
import { useSignUp } from "../api/use-auth-mutations";
import { email, newPassword } from "../schemas";

const schema = z.object({ name: z.string().trim().min(1, "Enter your name.").max(80), email, password: newPassword });
type Values = z.infer<typeof schema>;

export function SignupForm() {
  const signUp = useSignUp();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "", email: "", password: "" } });
  const onSubmit = form.handleSubmit((v) => signUp.mutate(v, { onError: (e) => applyServerError(form, e) }));
  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
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
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Work email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
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
              <FormDescription>At least 10 characters. A short phrase works well.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormRootError />
        <Button variant="primary" type="submit" size="lg" loading={signUp.isPending || signUp.isSuccess}>
          Create account
        </Button>
      </form>
    </Form>
  );
}
