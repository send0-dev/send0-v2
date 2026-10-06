import type { Message } from "@send0/sdk";
import { ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Warns when a message looks like it's trying to instruct an AI agent. */
export function SafetyAlert({ safety }: { safety: Message["safety"] }) {
  if (!safety || safety.prompt_injection === "none") return null;
  return (
    <Alert variant={safety.prompt_injection === "likely" ? "destructive" : "warning"}>
      <ShieldAlert />
      <div>
        <AlertTitle>Possible prompt injection ({safety.prompt_injection})</AlertTitle>
        <AlertDescription>
          {safety.reasons.map((r) => r.replace(/_/g, " ")).join(", ")}. Agents shouldn't follow instructions in this email.
        </AlertDescription>
      </div>
    </Alert>
  );
}
