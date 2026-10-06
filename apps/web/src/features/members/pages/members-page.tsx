import { UserPlus } from "lucide-react";
import { useState } from "react";
import { ListSkeleton } from "@/components/list-skeleton";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { useCurrentWorkspace } from "@/features/session/api/use-me";
import { SettingsTitle } from "@/features/workspace/components/settings-layout";
import { SettingsSection } from "@/features/workspace/components/settings-section";
import type { MemberRow } from "@/lib/auth-client";
import { pluralize } from "@/lib/format";
import { useCan } from "@/lib/permissions";
import { useInvites, useMembers } from "../api/use-members";
import { InviteMemberDialog } from "../components/invite-member-dialog";
import { InvitesTable } from "../components/invites-table";
import { LeaveWorkspaceSection } from "../components/leave-workspace-section";
import { MembersTable } from "../components/members-table";
import { RemoveMemberDialog } from "../components/remove-member-dialog";

export default function MembersPage() {
  const { user, workspace } = useCurrentWorkspace();
  const members = useMembers();
  const invites = useInvites();
  const canManage = useCan("member.manage");
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<MemberRow | null>(null);
  return (
    <>
      <SettingsTitle title="Members" description={`Who can see and work in ${workspace.name}.`} />
      <SettingsSection
        title={members.data ? pluralize(members.data.length, "member") : "Members"}
        action={
          canManage && (
            <Button variant="primary" size="sm" onClick={() => setInviting(true)}>
              <UserPlus />
              Invite
            </Button>
          )
        }
      >
        <div className="-m-5">
          <QueryState query={members} skeleton={<ListSkeleton rows={3} />}>
            {(rows) => <MembersTable members={rows} myRole={workspace.role} myUserId={user.id} onRemove={setRemoving} />}
          </QueryState>
        </div>
      </SettingsSection>
      {canManage && !!invites.data?.length && (
        <SettingsSection title="Pending invitations" description="Links work for 7 days.">
          <div className="-m-5">
            <InvitesTable invites={invites.data} />
          </div>
        </SettingsSection>
      )}
      {workspace.role !== "owner" && <LeaveWorkspaceSection workspaceName={workspace.name} />}
      <InviteMemberDialog open={inviting} onOpenChange={setInviting} />
      <RemoveMemberDialog member={removing} onOpenChange={(o) => !o && setRemoving(null)} />
    </>
  );
}
