import { zodResolver } from "@hookform/resolvers/zod";
import type { WebhookWithSecret } from "@send0/sdk";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, FormRootError } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { applyServerError } from "@/lib/form-errors";
import { useCreateWebhook } from "../api/use-webhook-mutations";
import { EVENT_TYPES, WEBHOOK_EVENTS } from "../events";

const schema = z
  .object({
    url: z
      .string()
      .trim()
      .url("Enter a full URL, like https://example.com/hooks/send0")
      .refine((u) => u.startsWith("https://"), "Webhooks must use https://"),
    allEvents: z.boolean(),
    events: z.array(z.enum(EVENT_TYPES)),
  })
  .refine((v) => v.allEvents || v.events.length > 0, { path: ["events"], message: "Pick at least one event." });
type Values = z.infer<typeof schema>;

export function CreateWebhookForm({ onCreated, onCancel }: { onCreated: (w: WebhookWithSecret) => void; onCancel: () => void }) {
  const create = useCreateWebhook();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { url: "", allEvents: true, events: [] } });
  const allEvents = form.watch("allEvents");
  const onSubmit = form.handleSubmit((v) =>
    create.mutate(
      { url: v.url, events: v.allEvents ? ["*"] : v.events },
      { onSuccess: onCreated, onError: (e) => applyServerError(form, e) },
    ),
  );
  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="grid gap-5" noValidate>
        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Endpoint URL</FormLabel>
              <FormControl>
                <Input type="url" placeholder="https://example.com/hooks/send0" autoFocus {...field} />
              </FormControl>
              <FormDescription>We POST signed JSON here. Respond with 2xx within 10 seconds.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="allEvents"
          render={({ field }) => (
            <FormItem className="flex items-center gap-2">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
              </FormControl>
              <FormLabel className="font-normal">Send every event</FormLabel>
            </FormItem>
          )}
        />
        {!allEvents && (
          <FormField
            control={form.control}
            name="events"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Events</FormLabel>
                <div className="divide-y rounded-md border">
                  {WEBHOOK_EVENTS.map((ev) => (
                    <label key={ev.type} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-muted/50">
                      <Checkbox
                        checked={field.value.includes(ev.type)}
                        onCheckedChange={(c) =>
                          field.onChange(c === true ? [...field.value, ev.type] : field.value.filter((t) => t !== ev.type))
                        }
                      />
                      <span className="font-mono text-xs">{ev.type}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{ev.description}</span>
                    </label>
                  ))}
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
            Add endpoint
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
