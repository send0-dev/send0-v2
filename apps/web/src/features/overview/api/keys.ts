export const usageKeys = {
  all: ["usage"] as const,
  stats: (days: number) => ["usage", "stats", days] as const,
};
