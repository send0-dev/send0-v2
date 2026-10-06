import { UserPlus } from "lucide-react";
import { useState } from "react";
import { TableSkeleton } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentWorkspace } from "@/features/session/api/use-me";
import { SettingsTabs } from "@/features/workspace/components/settings-tabs";
import type { MemberRow } from "@/lib/auth-client";
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
      <PageHeader title="Settings" />
      <SettingsTabs />
      <div className="grid gap-5">
        <Card>
          <CardHeader className="items-center">
            <CardTitle>Members</CardTitle>
            {canManage && (
              <Button size="sm" onClick={() => setInviting(true)}>
                <UserPlus />
                Invite
              </Button>
            )}
          </CardHeader>
          <QueryState query={members} skeleton={<TableSkeleton columns={3} rows={3} />}>
            {(rows) => <MembersTable members={rows} myRole={workspace.role} myUserId={user.id} onRemove={setRemoving} />}
          </QueryState>
        </Card>
        {canManage && !!invites.data?.length && (
          <Card>
            <CardHeader>
              <CardTitle>Pending invitations</CardTitle>
            </CardHeader>
            <InvitesTable invites={invites.data} />
          </Card>
        )}
        {workspace.role !== "owner" && <LeaveWorkspaceSection workspaceName={workspace.name} />}
      </div>
      <InviteMemberDialog open={inviting} onOpenChange={setInviting} />
      <RemoveMemberDialog member={removing} onOpenChange={(o) => !o && setRemoving(null)} />
    </>
  );
}
