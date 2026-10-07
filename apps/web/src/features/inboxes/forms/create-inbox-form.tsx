import { zodResolver } from "@hookform/resolvers/zod";
import type { Inbox } from "@send0/sdk";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, FormRootError } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { applyServerError } from "@/lib/form-errors";
import { useCreateInbox } from "../api/use-inbox-mutations";
import { SEND_POLICIES, type SendPolicy } from "../policy";

const schema = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .max(64, "Use at most 64 characters.")
    .regex(/^([a-z0-9]([a-z0-9._-]*[a-z0-9])?)?$/, "Use letters, numbers, dots, dashes and underscores."),
  displayName: z.string().trim().max(100),
  sendPolicy: z.enum(["reply_only", "approval", "open"]),
});
type Values = z.infer<typeof schema>;

export function CreateInboxForm({
  onCreated,
  onCancel,
  domain,
}: {
  onCreated: (inbox: Inbox) => void;
  onCancel: () => void;
  domain: string | undefined;
}) {
  const create = useCreateInbox();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "", displayName: "", sendPolicy: "reply_only" } });

  const onSubmit = form.handleSubmit((v) =>
    create.mutate(
      { ...(v.name ? { name: v.name } : {}), ...(v.displayName ? { display_name: v.displayName } : {}), send_policy: v.sendPolicy },
      { onSuccess: onCreated, onError: (e) => applyServerError(form, e) },
    ),
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="grid gap-5" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <div className="flex items-center rounded-md border border-input bg-card shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20">
                <FormControl>
                  <input
                    {...field}
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="support-agent"
                    className="h-8 min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground/70"
                  />
                </FormControl>
                {domain && <span className="pr-2.5 font-mono text-[12.5px] text-muted-foreground">@{domain}</span>}
              </div>
              <FormDescription>Leave empty for a random address.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Display name</FormLabel>
              <FormControl>
                <Input placeholder="Acme Support" {...field} />
              </FormControl>
              <FormDescription>Shown as the sender name. Optional.</FormDescription>
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
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={create.isPending}>
            Create inbox
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
