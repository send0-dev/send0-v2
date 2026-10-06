import { Badge } from "@/components/ui/badge";
import { SEND_POLICIES, type SendPolicy } from "../policy";

export function PolicyBadge({ policy }: { policy: SendPolicy }) {
  return <Badge variant={policy === "approval" ? "warning" : policy === "open" ? "info" : "neutral"}>{SEND_POLICIES[policy].label}</Badge>;
}
