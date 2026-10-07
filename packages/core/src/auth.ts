export type AuthVerdict = "pass" | "fail" | "softfail" | "neutral" | "none" | "temperror" | "permerror" | "policy";

export interface AuthResults {
  spf: AuthVerdict;
  dkim: AuthVerdict;
  dmarc: AuthVerdict;
  /** authserv-id of the header the verdicts came from, or null if no trusted header was found */
  source: string | null;
}

export interface HeaderLike {
  key: string;
  value: string;
}

const VERDICTS = new Set<AuthVerdict>(["pass", "fail", "softfail", "neutral", "none", "temperror", "permerror", "policy"]);

function verdict(body: string, method: "spf" | "dkim" | "dmarc"): AuthVerdict {
  // A message can carry several dkim= results (one per signature). Any pass counts as pass.
  const all = [...body.matchAll(new RegExp(`(?:^|[;\\s])${method}\\s*=\\s*([a-z]+)`, "gi"))].map((m) => m[1]!.toLowerCase());
  if (all.length === 0) return "none";
  if (all.includes("pass")) return "pass";
  const first = all[0] as AuthVerdict;
  return VERDICTS.has(first) ? first : "none";
}

/**
 * SPF/DKIM/DMARC verdicts from the Authentication-Results header added by *our* receiving MTA.
 *
 * Senders can forge Authentication-Results, so only headers whose authserv-id matches a trusted id
 * are read, and only the topmost one (closest to us). ARC-Authentication-Results with i=1 from a
 * trusted server is accepted as a fallback, since some relays only add that.
 */
export function parseAuthResults(headers: HeaderLike[], trustedAuthservIds: string[]): AuthResults {
  const trusted = trustedAuthservIds.map((t) => t.toLowerCase());
  const isTrusted = (id: string) => trusted.some((t) => id === t || id.endsWith(`.${t}`));

  const pick = (key: string, strip?: RegExp) => {
    for (const h of headers) {
      if (h.key.toLowerCase() !== key) continue;
      const value = strip ? h.value.replace(strip, "") : h.value;
      const id = value.split(";")[0]!.trim().split(/\s+/)[0]!.toLowerCase();
      if (isTrusted(id)) return { id, body: value.slice(value.indexOf(";") + 1) };
    }
    return null;
  };

  const found = pick("authentication-results") ?? pick("arc-authentication-results", /^\s*i\s*=\s*1\s*;\s*/i);
  if (!found) return { spf: "none", dkim: "none", dmarc: "none", source: null };
  return {
    spf: verdict(found.body, "spf"),
    dkim: verdict(found.body, "dkim"),
    dmarc: verdict(found.body, "dmarc"),
    source: found.id,
  };
}
