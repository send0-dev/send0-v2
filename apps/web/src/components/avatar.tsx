import { hueOf } from "@/lib/hue";
import { cn } from "@/lib/utils";

const SIZES = { xs: "size-4 text-[8px]", sm: "size-5 text-[9px]", md: "size-6 text-[10px]", lg: "size-8 text-xs" } as const;

/** Initials on a colour picked from the name, the way Linear shows people. */
export function Avatar({ name, size = "md", className }: { name: string; size?: keyof typeof SIZES; className?: string }) {
  const hue = hueOf(name);
  const letters =
    name
      .replace(/<.*>/, "")
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "?";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none",
        SIZES[size],
        className,
      )}
      style={{ background: `linear-gradient(135deg, oklch(0.66 0.13 ${hue}), oklch(0.52 0.14 ${(hue + 40) % 360}))` }}
    >
      {letters}
    </span>
  );
}

/** A small coloured square for an inbox. */
export function InboxDot({ id, className }: { id: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-[3px]", className)}
      style={{ background: `oklch(0.68 0.14 ${hueOf(id)})` }}
    />
  );
}
