import { useParams } from "react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { useWebhook } from "../api/use-webhooks";

export function WebhookCrumb() {
  const { webhookId } = useParams();
  const hook = useWebhook(webhookId);
  return hook.data ? <span className="font-mono text-[12.5px]">{new URL(hook.data.url).host}</span> : <Skeleton className="inline-block h-3.5 w-32 align-middle" />;
}
