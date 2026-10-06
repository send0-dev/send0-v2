import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** What a view shows when it has nothing yet: a glyph on a soft glow, what this is, and the next step. */
export function EmptyState({ icon: Icon, title, description, action, className }: { icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex animate-enter flex-col items-center justify-center px-6 py-16 text-center", className)}>
      {Icon && (
        <div className="relative mb-5">
          <div className="absolute inset-[-18px] rounded-full bg-brand/10 blur-xl" />
          <div className="relative flex size-11 items-center justify-center rounded-xl border border-border-strong bg-elevated shadow-elevated">
            <Icon className="size-5 text-muted-foreground" strokeWidth={1.75} />
          </div>
        </div>
      )}
      <p className="text-[14px] font-medium">{title}</p>
      {description && <div className="mt-1 max-w-sm text-[13px] leading-relaxed text-balance text-muted-foreground">{description}</div>}
      {action && <div className="mt-5 flex items-center gap-2">{action}</div>}
    </div>
  );
}
