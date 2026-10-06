import { zodResolver } from "@hookform/resolvers/zod";
import type { ApiKeyWithSecret } from "@send0/sdk";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, FormRootError } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { useInboxes } from "@/features/inboxes/api/use-inboxes";
import { applyServerError } from "@/lib/form-errors";
import { ACCESS_LEVELS, type AccessLevel } from "../access";
import { useCreateApiKey } from "../api/use-create-api-key";

const schema = z
  .object({
    name: z.string().trim().min(1, "Give the key a name, like the agent that will use it.").max(100),
    access: z.enum(["send", "read", "admin"]),
    allInboxes: z.boolean(),
    inboxIds: z.array(z.string()),
  })
  .refine((v) => v.allInboxes || v.inboxIds.length > 0, { path: ["inboxIds"], message: "Pick at least one inbox." });

type Values = z.infer<typeof schema>;

export function CreateApiKeyForm({ onCreated, onCancel }: { onCreated: (key: ApiKeyWithSecret) => void; onCancel: () => void }) {
  const create = useCreateApiKey();
  const inboxes = useInboxes();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "", access: "send", allInboxes: true, inboxIds: [] } });
  const allInboxes = form.watch("allInboxes");

  const onSubmit = form.handleSubmit((v) =>
    create.mutate(
      { name: v.name, scopes: [...ACCESS_LEVELS[v.access].scopes], inbox_ids: v.allInboxes ? null : v.inboxIds },
      { onSuccess: onCreated, onError: (e) => applyServerError(form, e) }
    )
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="grid gap-5" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Signup agent" autoFocus autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="access"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Access</FormLabel>
              <RadioGroup value={field.value} onValueChange={(v) => field.onChange(v as AccessLevel)}>
                {(Object.keys(ACCESS_LEVELS) as AccessLevel[]).map((level) => (
                  <RadioCard key={level} value={level} title={ACCESS_LEVELS[level].label} description={ACCESS_LEVELS[level].description} />
                ))}
              </RadioGroup>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="allInboxes"
          render={({ field }) => (
            <FormItem className="flex items-center gap-2 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
              </FormControl>
              <FormLabel className="font-normal">Works with every inbox</FormLabel>
            </FormItem>
          )}
        />
        {!allInboxes && (
          <FormField
            control={form.control}
            name="inboxIds"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Only these inboxes</FormLabel>
                <FormDescription>Give each agent a key for its own inbox, so a leaked key can't read the others.</FormDescription>
                <div className="max-h-44 divide-y overflow-y-auto rounded-md border">
                  {inboxes.items.map((inbox) => (
                    <label key={inbox.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-muted/50">
                      <Checkbox
                        checked={field.value.includes(inbox.id)}
                        onCheckedChange={(c) => field.onChange(c === true ? [...field.value, inbox.id] : field.value.filter((id) => id !== inbox.id))}
                      />
                      <span className="truncate font-mono text-[12.5px]">{inbox.address}</span>
                    </label>
                  ))}
                  {inboxes.isSuccess && !inboxes.items.length && <p className="px-3 py-2 text-[13px] text-muted-foreground">No inboxes yet.</p>}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <FormRootError />
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={create.isPending}>
            Create key
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
