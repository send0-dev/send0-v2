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

/**
 * Splits a header body into its ";"-separated parts (RFC 8601 resinfo), honouring quoted strings and
 * (nested) comments. Comments are dropped. Property values such as smtp.mailfrom or smtp.helo are
 * sender-controlled, so a ";" or "dmarc=pass" inside them must never start a new result.
 */
function splitResults(body: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let quoted = false;
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (quoted) {
      if (ch === "\\") cur += ch + (body[++i] ?? "");
      else {
        if (ch === '"') quoted = false;
        cur += ch;
      }
    } else if (depth > 0) {
      if (ch === "\\") i++;
      else if (ch === "(") depth++;
      else if (ch === ")" && --depth === 0) cur += " ";
    } else if (ch === '"') {
      quoted = true;
      cur += ch;
    } else if (ch === "(") depth = 1;
    else if (ch === ";") {
      parts.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  parts.push(cur.trim());
  return parts;
}

/** The leading "method[/version]=result" of one result; anything after it is properties, which we ignore. */
const RESULT = /^([a-z0-9-]+)(?:\s*\/\s*\d+)?\s*=\s*([a-z]+)(?=\s|$)/i;

function verdicts(results: string[]): Pick<AuthResults, "spf" | "dkim" | "dmarc"> {
  const seen: Record<"spf" | "dkim" | "dmarc", AuthVerdict[]> = { spf: [], dkim: [], dmarc: [] };
  for (const r of results) {
    const m = RESULT.exec(r);
    if (!m) continue;
    const method = m[1]!.toLowerCase();
    const result = m[2]!.toLowerCase() as AuthVerdict;
    if ((method === "spf" || method === "dkim" || method === "dmarc") && VERDICTS.has(result)) seen[method].push(result);
  }
  // A message can carry several DKIM signatures; any passing one counts. SPF and DMARC have one result each.
  return {
    spf: seen.spf[0] ?? "none",
    dkim: seen.dkim.includes("pass") ? "pass" : (seen.dkim[0] ?? "none"),
    dmarc: seen.dmarc[0] ?? "none",
  };
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
      const [head = "", ...results] = splitResults(strip ? h.value.replace(strip, "") : h.value);
      const id = head.split(/\s+/)[0]!.toLowerCase();
      if (isTrusted(id)) return { id, results };
    }
    return null;
  };

  const found = pick("authentication-results") ?? pick("arc-authentication-results", /^\s*i\s*=\s*1\s*;\s*/i);
  if (!found) return { spf: "none", dkim: "none", dmarc: "none", source: null };
  return { ...verdicts(found.results), source: found.id };
}
