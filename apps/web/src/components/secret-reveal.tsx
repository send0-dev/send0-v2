import { TriangleAlert } from "lucide-react";
import { CopyField } from "@/components/copy-field";

/** A secret shown exactly once (API key, signing secret), with the warning that goes with it. */
export function SecretReveal({ value, what }: { value: string; what: string }) {
  return (
    <div className="grid gap-2">
      <CopyField value={value} label={`Copy ${what}`} />
      <p className="flex items-start gap-1.5 text-[13px] text-warning">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
        This is the only time you'll see the full {what}. Store it in your secrets manager now.
      </p>
    </div>
  );
}
