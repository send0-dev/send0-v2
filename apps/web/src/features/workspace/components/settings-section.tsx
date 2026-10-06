import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A titled block on a settings page. `danger` marks irreversible actions. */
export function SettingsSection({ title, description, children, danger, action }: { title: string; description?: ReactNode; children: ReactNode; danger?: boolean; action?: ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className={cn("text-[14px] font-medium", danger && "text-destructive")}>{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className={cn("rounded-lg border bg-card p-5", danger && "border-destructive/25")}>{children}</div>
    </section>
  );
}

/** A label/description on the left and its control on the right, inside a settings block. */
export function SettingsRow({ label, description, children }: { label: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b py-4 first:pt-0 last:border-b-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{label}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
