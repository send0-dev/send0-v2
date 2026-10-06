import { cn } from "@/lib/utils";

/** A workspace's initial on a tile whose shade comes from its name, so workspaces are easy to tell apart. */
export function WorkspaceAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center rounded-md font-semibold text-white", size === "sm" ? "size-5 text-[10px]" : "size-7 text-xs")}
      style={{ background: `oklch(0.55 0.12 ${hue})` }}
    >
      {name.trim()[0]?.toUpperCase() ?? "?"}
    </span>
  );
}
