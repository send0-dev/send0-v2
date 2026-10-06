import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormRootError } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { applyServerError } from "@/lib/form-errors";
import { useEnsureWorkspace } from "../api/use-onboarding";
import { StepHeader } from "../components/step-header";

const schema = z.object({ name: z.string().trim().min(2, "Use 2–60 characters.").max(60, "Use 2–60 characters.") });
type Values = z.infer<typeof schema>;

export function WorkspaceStep({ defaultName, onDone }: { defaultName: string; onDone: () => void }) {
  const ensure = useEnsureWorkspace();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: defaultName } });
  const onSubmit = form.handleSubmit((v) => ensure.mutate(v.name, { onSuccess: onDone, onError: (e) => applyServerError(form, e) }));
  return (
    <>
      <StepHeader title="Name your workspace" description="Usually your company or project. Inboxes, keys and teammates live here." />
      <Form {...form}>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Workspace name</FormLabel>
                <FormControl>
                  <Input placeholder="Acme" autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormRootError />
          <Button type="submit" size="lg" loading={ensure.isPending}>
            Continue
          </Button>
        </form>
      </Form>
    </>
  );
}
