import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A titled block on a settings page: heading and one line of context, then a card of rows
 * (SettingsRow) or free content (SettingsBody). `danger` marks irreversible actions.
 */
export function SettingsSection({
  title,
  description,
  children,
  danger,
  action,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  danger?: boolean;
  action?: ReactNode;
}) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className={cn("text-[13px] font-medium", danger && "text-destructive")}>{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className={cn("divide-y overflow-hidden rounded-lg border bg-card", danger && "border-destructive/25")}>{children}</div>
    </section>
  );
}

/** A label and description on the left, its control on the right. Stacks on phones. */
export function SettingsRow({ label, description, children }: { label: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-3.5">
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-[13px] font-medium">{label}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2 max-sm:w-full">{children}</div>
    </div>
  );
}

/** Free-form content inside a settings card (e.g. a multi-field form). */
export function SettingsBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}
