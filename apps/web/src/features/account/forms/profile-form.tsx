import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, FormRootError } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applyServerError } from "@/lib/form-errors";
import { useUpdateProfile } from "../api/use-account-mutations";

const schema = z.object({ name: z.string().trim().max(80, "Use at most 80 characters.") });
type Values = z.infer<typeof schema>;

export function ProfileForm({ name, email }: { name: string | null; email: string }) {
  const update = useUpdateProfile();
  const form = useForm<Values>({ resolver: zodResolver(schema), values: { name: name ?? "" } });
  const onSubmit = form.handleSubmit((v) => update.mutate({ name: v.name || null }, { onSuccess: () => toast.success("Profile saved"), onError: (e) => applyServerError(form, e) }));
  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="grid max-w-md gap-4" noValidate>
        <div className="grid gap-1.5">
          <Label htmlFor="account-email">Email</Label>
          <Input id="account-email" value={email} disabled readOnly />
          <p className="text-[13px] text-muted-foreground">To change it, email support@send0.dev from this address.</p>
        </div>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormDescription>Shown to teammates and on invitations you send.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormRootError />
        <div>
          <Button variant="primary" type="submit" loading={update.isPending} disabled={!form.formState.isDirty}>
            Save
          </Button>
        </div>
      </form>
    </Form>
  );
}
