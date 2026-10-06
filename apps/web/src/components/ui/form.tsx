import { Slot } from "radix-ui";
import { createContext, useContext, useEffect, useId, useState, type ComponentProps } from "react";
import { Controller, FormProvider, useFormContext, useFormState, type ControllerProps, type FieldPath, type FieldValues } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const Form = FormProvider;

const FieldNameContext = createContext<{ name: string } | null>(null);
interface ItemContextValue {
  id: string;
  hasDescription: boolean;
  setHasDescription: (has: boolean) => void;
}
const ItemContext = createContext<ItemContextValue | null>(null);

export function FormField<TValues extends FieldValues = FieldValues, TName extends FieldPath<TValues> = FieldPath<TValues>>(
  props: ControllerProps<TValues, TName>
) {
  return (
    <FieldNameContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FieldNameContext.Provider>
  );
}

/** The current field's ids and error, for labels, controls and messages. */
export function useFormField() {
  const field = useContext(FieldNameContext);
  const item = useContext(ItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: field?.name });
  if (!field || !item) throw new Error("useFormField must be used inside <FormField> and <FormItem>");
  const { id, hasDescription, setHasDescription } = item;
  return {
    id,
    hasDescription,
    setHasDescription,
    name: field.name,
    controlId: `${id}-control`,
    descriptionId: `${id}-description`,
    messageId: `${id}-message`,
    ...getFieldState(field.name, formState),
  };
}

export function FormItem({ className, ...props }: ComponentProps<"div">) {
  const id = useId();
  const [hasDescription, setHasDescription] = useState(false);
  return (
    <ItemContext.Provider value={{ id, hasDescription, setHasDescription }}>
      <div data-slot="form-item" className={cn("grid gap-1.5", className)} {...props} />
    </ItemContext.Provider>
  );
}

export function FormLabel({ className, ...props }: ComponentProps<typeof Label>) {
  const { error, controlId } = useFormField();
  return <Label data-error={!!error} className={cn("data-[error=true]:text-destructive", className)} htmlFor={controlId} {...props} />;
}

export function FormControl(props: ComponentProps<typeof Slot.Root>) {
  const { error, controlId, descriptionId, messageId, hasDescription } = useFormField();
  // Only reference the hint and the error when they're actually on the page.
  const describedBy = [hasDescription && descriptionId, error && messageId].filter(Boolean).join(" ") || undefined;
  return (
    <Slot.Root
      id={controlId}
      aria-describedby={describedBy}
      aria-invalid={!!error}
      {...props}
    />
  );
}

export function FormDescription({ className, ...props }: ComponentProps<"p">) {
  const { descriptionId, setHasDescription } = useFormField();
  useEffect(() => {
    setHasDescription(true);
    return () => setHasDescription(false);
  }, [setHasDescription]);
  return <p id={descriptionId} className={cn("text-[13px] text-muted-foreground", className)} {...props} />;
}

export function FormMessage({ className, children, ...props }: ComponentProps<"p">) {
  const { error, messageId } = useFormField();
  const body = error ? String(error.message ?? "") : children;
  if (!body) return null;
  return (
    <p id={messageId} className={cn("text-[13px] text-destructive", className)} {...props}>
      {body}
    </p>
  );
}

/** A form-level error (not tied to one field), shown above the submit button. */
export function FormRootError({ className }: { className?: string }) {
  const { errors } = useFormState();
  const message = errors.root?.server?.message;
  if (!message) return null;
  return (
    <p role="alert" className={cn("rounded-md bg-destructive-soft px-3 py-2 text-[13px] text-destructive", className)}>
      {message}
    </p>
  );
}
