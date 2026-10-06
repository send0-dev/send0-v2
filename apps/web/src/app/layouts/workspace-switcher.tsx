import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCurrentWorkspace } from "@/features/session/api/use-me";
import { useSwitchWorkspace } from "@/features/session/api/use-session-actions";
import { CreateWorkspaceDialog } from "@/features/workspace/components/create-workspace-dialog";
import { WorkspaceAvatar } from "@/features/workspace/components/workspace-avatar";

const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "Member" } as const;

/** The workspace at the top of the sidebar: which one you're in, and switching or creating another. */
export function WorkspaceSwitcher() {
  const { workspace, workspaces } = useCurrentWorkspace();
  const switchTo = useSwitchWorkspace();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger aria-label={`Workspace: ${workspace.name}. Switch workspace`} className="flex w-full cursor-pointer items-center gap-2.5 rounded-md p-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40">
          <WorkspaceAvatar name={workspace.name} />
          <span className="grid min-w-0 flex-1">
            <span className="truncate text-[13px] font-medium">{workspace.name}</span>
            <span className="text-xs text-muted-foreground">{ROLE_LABEL[workspace.role]}</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent opensDialogs className="w-64" align="start">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuItem key={w.id} onSelect={() => w.id !== workspace.id && switchTo.mutate(w.id)}>
              <WorkspaceAvatar name={w.name} size="sm" />
              <span className="flex-1 truncate">{w.name}</span>
              {w.id === workspace.id && <Check className="!text-foreground" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <Plus />
            Create workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateWorkspaceDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
