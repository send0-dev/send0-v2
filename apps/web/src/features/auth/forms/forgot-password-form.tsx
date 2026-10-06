import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormRootError } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { applyServerError } from "@/lib/form-errors";
import { useForgotPassword } from "../api/use-auth-mutations";
import { email } from "../schemas";

const schema = z.object({ email });
type Values = z.infer<typeof schema>;

export function ForgotPasswordForm({ onSent }: { onSent: (email: string) => void }) {
  const forgot = useForgotPassword();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "" } });
  const onSubmit = form.handleSubmit((v) => forgot.mutate(v.email, { onSuccess: () => onSent(v.email), onError: (e) => applyServerError(form, e) }));
  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormRootError />
        <Button type="submit" size="lg" loading={forgot.isPending}>
          Send reset link
        </Button>
      </form>
    </Form>
  );
}
