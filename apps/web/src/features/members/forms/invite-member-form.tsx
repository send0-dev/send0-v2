import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormRootError } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { applyServerError } from "@/lib/form-errors";
import { useInviteMember } from "../api/use-member-mutations";
import { ROLE_INFO } from "../roles";

const schema = z.object({ email: z.string().trim().min(1, "Enter an email address.").email("Enter a valid email address."), role: z.enum(["member", "admin"]) });
type Values = z.infer<typeof schema>;

export function InviteMemberForm({ onInvited, onCancel }: { onInvited: (email: string) => void; onCancel: () => void }) {
  const invite = useInviteMember();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", role: "member" } });
  const onSubmit = form.handleSubmit((v) => invite.mutate(v, { onSuccess: () => onInvited(v.email), onError: (e) => applyServerError(form, e) }));
  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="grid gap-5" noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="teammate@company.com" autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <RadioGroup value={field.value} onValueChange={field.onChange}>
                {(["member", "admin"] as const).map((r) => (
                  <RadioCard key={r} value={r} title={ROLE_INFO[r].label} description={ROLE_INFO[r].description} />
                ))}
              </RadioGroup>
            </FormItem>
          )}
        />
        <FormRootError />
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={invite.isPending}>
            Send invitation
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
