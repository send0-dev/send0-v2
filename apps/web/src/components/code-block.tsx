import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

export function CodeBlock({ code, className }: { code: string; className?: string }) {
  return (
    <div className={cn("group relative rounded-lg border bg-card", className)}>
      <pre className="overflow-x-auto p-3.5 pr-12 font-mono text-[12.5px] leading-relaxed">
        <code>{code}</code>
      </pre>
      <CopyButton value={code} label="Copy code" className="absolute top-2 right-2 bg-card shadow-[-8px_0_8px_var(--card)]" />
    </div>
  );
}
