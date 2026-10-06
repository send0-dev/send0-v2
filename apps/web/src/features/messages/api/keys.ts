import type { ListAllMessagesParams } from "@send0/sdk";

export const messageKeys = {
  all: ["messages"] as const,
  list: (filters: ListAllMessagesParams) => [...messageKeys.all, "list", filters] as const,
  detail: (id: string) => [...messageKeys.all, "detail", id] as const,
};
