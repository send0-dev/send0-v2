/** Where people and SDKs reach this install: PUBLIC_URL when set, else the request's own origin (workers.dev or a custom domain). */
export function publicUrlFor(configured: string | undefined, request: Request): string {
  return configured ?? new URL(request.url).origin;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Keeps one canonical URL, so cookies, CSRF checks and signed links agree: a 308 (method and body
 * kept) to PUBLIC_URL for any other origin, or to https for plain http off a local machine.
 * Path and query are kept. Null when the request is already where it should be.
 */
export function canonicalRedirect(configured: string | undefined, request: Request): Response | null {
  const url = new URL(request.url);
  let target: string | null = null;
  if (configured && url.origin !== new URL(configured).origin) target = configured + url.pathname + url.search;
  else if (!configured && url.protocol === "http:" && !LOCAL_HOSTS.has(url.hostname)) {
    url.protocol = "https:";
    target = url.toString();
  }
  return target ? new Response(null, { status: 308, headers: { location: target } }) : null;
}
