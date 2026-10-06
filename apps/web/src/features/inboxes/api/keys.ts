export const inboxKeys = {
  all: ["inboxes"] as const,
  list: () => [...inboxKeys.all, "list"] as const,
  detail: (id: string) => [...inboxKeys.all, "detail", id] as const,
  threads: (id: string) => [...inboxKeys.all, "threads", id] as const,
  thread: (inboxId: string, threadId: string) => [...inboxKeys.all, "thread", inboxId, threadId] as const,
};
