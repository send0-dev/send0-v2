import type { Message } from "@send0/sdk";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";

const tone = (verdict: string) => (verdict === "pass" ? "success" : verdict === "fail" || verdict === "softfail" ? "warning" : "neutral");

/** SPF, DKIM and DMARC results for a received message. */
export function AuthBadges({ auth }: { auth: Message["auth"] }) {
  if (!auth) return null;
  return (
    <Tooltip content="Sender authentication: whether the message really came from the domain it claims">
      <span className="inline-flex gap-1">
        {(["spf", "dkim", "dmarc"] as const).map((k) => (
          <Badge key={k} variant={tone(auth[k])} className="font-mono uppercase">
            {k} {auth[k]}
          </Badge>
        ))}
      </span>
    </Tooltip>
  );
}
