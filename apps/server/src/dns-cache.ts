import { promises as dns } from "node:dns";

/** mailauth's resolver shape: `(name, rrtype) => records`, rejecting with a Node DNS error code. */
export type DnsResolver = (name: string, rrtype: string) => Promise<string[][] | string[]>;

/** Answers that mean "no such record"; stable enough to cache, unlike timeouts and SERVFAILs. */
const NEGATIVE = new Set(["ENOTFOUND", "ENODATA"]);

interface Entry {
  expires: number;
  result: Promise<string[][] | string[]>;
}

/**
 * Wraps a DNS resolver with a small in-memory cache, so SPF, DKIM and DMARC lookups for busy
 * senders don't hit DNS on every message. Positive and "no such record" answers are kept for
 * `ttlMs` (default 5 minutes); transient failures are not cached. Oldest entries go first once full.
 */
export function cachingResolver(
  opts: { resolve?: DnsResolver; ttlMs?: number; maxEntries?: number; now?: () => number } = {},
): DnsResolver {
  const resolve = opts.resolve ?? ((name, rrtype) => dns.resolve(name, rrtype) as Promise<string[][] | string[]>);
  const ttlMs = opts.ttlMs ?? 5 * 60_000;
  const maxEntries = opts.maxEntries ?? 10_000;
  const now = opts.now ?? Date.now;
  const cache = new Map<string, Entry>();

  return (name, rrtype) => {
    const key = `${rrtype.toUpperCase()} ${name.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit && hit.expires > now()) return hit.result;
    cache.delete(key);

    const result = resolve(name, rrtype);
    result.catch((err: unknown) => {
      // Drop transient failures, unless a newer lookup has already replaced this entry.
      if (!NEGATIVE.has((err as { code?: string }).code ?? "") && cache.get(key)?.result === result) cache.delete(key);
    });
    while (cache.size >= maxEntries) cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: now() + ttlMs, result });
    return result;
  };
}
