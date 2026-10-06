import { zodResolver } from "@hookform/resolvers/zod";
import type { Inbox } from "@send0/sdk";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, FormRootError } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { applyServerError } from "@/lib/form-errors";
import { useUpdateInbox } from "../api/use-inbox-mutations";
import { SEND_POLICIES, type SendPolicy } from "../policy";

const schema = z.object({
  displayName: z.string().trim().max(100),
  sendPolicy: z.enum(["reply_only", "approval", "open"]),
});
type Values = z.infer<typeof schema>;

export function InboxSettingsForm({ inbox, onSaved }: { inbox: Inbox; onSaved: () => void }) {
  const update = useUpdateInbox(inbox.id);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { displayName: inbox.display_name ?? "", sendPolicy: inbox.send_policy } });

  const onSubmit = form.handleSubmit((v) =>
    update.mutate(
      { display_name: v.displayName || null, send_policy: v.sendPolicy },
      {
        onSuccess: () => {
          toast.success("Inbox saved");
          onSaved();
        },
        onError: (e) => applyServerError(form, e),
      }
    )
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="grid gap-5" noValidate>
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Display name</FormLabel>
              <FormControl>
                <Input placeholder="Acme Support" {...field} />
              </FormControl>
              <FormDescription>Shown as the sender name on outgoing mail.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="sendPolicy"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sending</FormLabel>
              <RadioGroup value={field.value} onValueChange={(v) => field.onChange(v as SendPolicy)}>
                {(["reply_only", "approval", "open"] as const).map((p) => (
                  <RadioCard key={p} value={p} title={SEND_POLICIES[p].label} description={SEND_POLICIES[p].description} />
                ))}
              </RadioGroup>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormRootError />
        <div className="flex justify-end">
          <Button variant="primary" type="submit" loading={update.isPending} disabled={!form.formState.isDirty}>
            Save changes
          </Button>
        </div>
      </form>
    </Form>
  );
}
