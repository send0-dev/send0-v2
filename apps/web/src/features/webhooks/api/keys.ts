export const webhookKeys = {
  all: ["webhooks"] as const,
  list: () => [...webhookKeys.all, "list"] as const,
  detail: (id: string) => [...webhookKeys.all, "detail", id] as const,
  deliveries: (id: string, status: string) => [...webhookKeys.all, "deliveries", id, status] as const,
};
