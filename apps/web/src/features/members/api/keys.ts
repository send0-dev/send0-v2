export const memberKeys = {
  all: ["members"] as const,
  list: () => [...memberKeys.all, "list"] as const,
  invites: () => [...memberKeys.all, "invites"] as const,
};
