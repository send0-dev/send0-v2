import type { Draft } from "@send0/sdk";

export type DraftStatus = Draft["status"];

export const draftKeys = {
  all: ["drafts"] as const,
  list: (status: DraftStatus) => [...draftKeys.all, "list", status] as const,
  pendingCount: () => [...draftKeys.all, "pending-count"] as const,
};
