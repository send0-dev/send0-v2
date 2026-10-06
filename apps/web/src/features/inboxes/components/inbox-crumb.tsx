import { useParams } from "react-router";
import { Skeleton } from "@/components/ui/skeleton";
import { useInbox } from "../api/use-inbox";

/** Breadcrumb label for an inbox: its address. */
export function InboxCrumb() {
  const { inboxId } = useParams();
  const inbox = useInbox(inboxId);
  return inbox.data ? <span className="font-mono text-[12.5px]">{inbox.data.address}</span> : <Skeleton className="inline-block h-3.5 w-36 align-middle" />;
}
