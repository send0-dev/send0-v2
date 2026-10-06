import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** What a list shows when it has nothing yet, with the next thing to do. */
export function EmptyState({ icon: Icon, title, description, action, className }: { icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-1 px-6 py-14 text-center", className)}>
      {Icon && (
        <div className="mb-3 flex size-10 items-center justify-center rounded-lg border bg-card shadow-xs">
          <Icon className="size-5 text-muted-foreground" />
        </div>
      )}
      <p className="font-medium">{title}</p>
      {description && <div className="max-w-sm text-[13px] text-muted-foreground">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
