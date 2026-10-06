import type { Usage } from "@send0/sdk";
import { OctagonPause } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/** Shown when the workspace's sending was paused (bounce or complaint thresholds, or by us). */
export function SendingPausedAlert({ sending }: { sending: Usage["sending"] }) {
  if (!sending.paused) return null;
  return (
    <Alert variant="destructive">
      <OctagonPause />
      <div>
        <AlertTitle>Sending is paused</AlertTitle>
        <AlertDescription>
          {sending.reason ?? "Too many bounces or complaints."} Receiving still works. Email support@send0.dev to review and resume.
        </AlertDescription>
      </div>
    </Alert>
  );
}
