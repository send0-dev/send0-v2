/** Filters shared by `wait`, list endpoints and the real-time hub. */
export interface MessageFilter {
  direction?: "in" | "out";
  /** Exact address or a wildcard such as *@acme.dev (case-insensitive) */
  from?: string;
  /** Case-insensitive substring of the subject */
  subject?: string;
}

/** Minimal message shape the matcher needs: the serialized message from events and the API. */
export interface MatchableMessage {
  direction: string;
  from: { email: string } | null;
  subject: string;
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .toLowerCase()
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}

/** Same semantics as the SQL in the list endpoint, so a message matches here iff it matches there. */
export function matchesFilter(m: MatchableMessage, f: MessageFilter): boolean {
  if (f.direction && m.direction !== f.direction) return false;
  if (f.from && !globToRegExp(f.from).test((m.from?.email ?? "").toLowerCase())) return false;
  if (f.subject && !m.subject.toLowerCase().includes(f.subject.toLowerCase())) return false;
  return true;
}
