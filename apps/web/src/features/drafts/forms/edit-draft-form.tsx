import { zodResolver } from "@hookform/resolvers/zod";
import type { Draft } from "@send0/sdk";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormRootError } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { applyServerError } from "@/lib/form-errors";
import { useUpdateDraft } from "../api/use-draft-mutations";

const schema = z.object({
  subject: z.string().trim().min(1, "Add a subject.").max(998),
  text: z.string().trim().min(1, "Write the message.").max(500_000),
});
type Values = z.infer<typeof schema>;

export function EditDraftForm({ draft, onSaved, onCancel }: { draft: Draft; onSaved: () => void; onCancel: () => void }) {
  const update = useUpdateDraft();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { subject: draft.subject, text: draft.text ?? "" } });
  const onSubmit = form.handleSubmit((v) =>
    // Editing replaces the HTML version too, so what's approved is exactly what was reviewed.
    update.mutate({ id: draft.id, subject: v.subject, text: v.text, html: null }, { onSuccess: onSaved, onError: (e) => applyServerError(form, e) })
  );
  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Subject</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="text"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Message</FormLabel>
              <FormControl>
                <Textarea className="min-h-48" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormRootError />
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" loading={update.isPending} disabled={!form.formState.isDirty}>
            Save draft
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
