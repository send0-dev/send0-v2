/** Where people and SDKs reach this install: PUBLIC_URL when set, else the request's own origin (workers.dev or a custom domain). */
export function publicUrlFor(configured: string | undefined, request: Request): string {
  return configured ?? new URL(request.url).origin;
}
