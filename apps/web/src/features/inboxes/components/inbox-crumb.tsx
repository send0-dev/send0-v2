import { useParams } from "react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { useInbox } from "../api/use-inbox";

/** Breadcrumb label for an inbox: its address. */
export function InboxCrumb() {
  const { inboxId } = useParams();
  const inbox = useInbox(inboxId);
  return inbox.data ? <span title={inbox.data.address}>{inbox.data.display_name || inbox.data.local_part}</span> : <Skeleton className="inline-block h-3.5 w-28 align-middle" />;
}
