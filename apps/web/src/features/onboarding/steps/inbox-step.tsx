import { zodResolver } from "@hookform/resolvers/zod";
import type { Inbox } from "@send0/sdk";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, FormRootError } from "@/components/ui/form";
import { useCreateInbox } from "@/features/inboxes/api/use-inbox-mutations";
import { useMailDomain } from "@/features/session/api/use-instance";
import { applyServerError } from "@/lib/form-errors";
import { StepHeader } from "../components/step-header";

const schema = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Pick an address.")
    .max(64)
    .regex(/^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/, "Use letters, numbers, dots, dashes and underscores."),
});
type Values = z.infer<typeof schema>;

/** A likely-free default such as "kunal-agent-4f2k": shared addresses are first come, first served. */
function suggestAddress(owner: string | null | undefined) {
  const first = (owner ?? "")
    .toLowerCase()
    .split(/\s+/)[0]!
    .replace(/[^a-z0-9]/g, "");
  return `${first || "my"}-agent-${Math.random().toString(36).slice(2, 6)}`;
}

export function InboxStep({ owner, onDone }: { owner: string | null; onDone: (inbox: Inbox) => void }) {
  const create = useCreateInbox();
  const domain = useMailDomain();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: suggestAddress(owner) } });
  const onSubmit = form.handleSubmit((v) =>
    create.mutate({ name: v.name }, { onSuccess: onDone, onError: (e) => applyServerError(form, e) }),
  );
  return (
    <>
      <StepHeader
        title="Create your first inbox"
        description="A real address your agent can receive and reply from. You can make more later."
      />
      <Form {...form}>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
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
                      spellCheck={false}
                      autoComplete="off"
                      className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                    />
                  </FormControl>
                  <span className="pr-3 font-mono text-[12.5px] text-muted-foreground">@{domain}</span>
                </div>
                <FormDescription>Letters, numbers, dots, dashes and underscores.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormRootError />
          <Button variant="primary" type="submit" size="lg" loading={create.isPending}>
            Create inbox
          </Button>
        </form>
      </Form>
    </>
  );
}
