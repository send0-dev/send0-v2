import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-6", className)}>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="currentColor" />
      <ellipse cx="16" cy="16.5" rx="6.2" ry="8" fill="none" stroke="var(--canvas)" strokeWidth="3.2" />
      <circle cx="25.5" cy="6.5" r="5" fill="var(--brand)" stroke="var(--canvas)" strokeWidth="2" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight", className)}>
      <LogoMark />
      send0
    </span>
  );
}
