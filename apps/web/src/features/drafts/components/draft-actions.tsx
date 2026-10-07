import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCan } from "@/lib/permissions";
import { useHotkeys } from "@/lib/use-hotkeys";

/** The decision, pinned under the draft: edit, reject, approve, with E / X / A shortcuts. */
export function DraftActions({
  onApprove,
  onReject,
  onEdit,
  deciding,
}: {
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
  deciding: "approve" | "reject" | null;
}) {
  const canDecide = useCan("draft.decide");
  const canEdit = useCan("draft.edit");
  const live = canDecide && !deciding;
  useHotkeys({ a: () => live && onApprove(), x: () => live && onReject(), e: () => live && canEdit && onEdit() }, live);
  if (!canDecide) return null;
  return (
    <div className="shrink-0 border-t">
      <div className="flex w-full max-w-[760px] items-center gap-2 px-gutter py-3">
        <p className="text-xs text-faint max-xl:hidden">Nothing is sent until you approve it.</p>
        <div className="ml-auto flex gap-2">
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={onEdit} shortcut="E" disabled={!!deciding}>
              <Pencil />
              Edit
            </Button>
          )}
          <Button size="sm" onClick={onReject} loading={deciding === "reject"} disabled={!!deciding} shortcut="X">
            Reject
          </Button>
          <Button variant="primary" size="sm" onClick={onApprove} loading={deciding === "approve"} disabled={!!deciding} shortcut="A">
            Approve & send
          </Button>
        </div>
      </div>
    </div>
  );
}
