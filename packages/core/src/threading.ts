export const SUBJECT_FALLBACK_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** `<a@x> <b@y>` → ["<a@x>", "<b@y>"]. Tolerates missing brackets and junk between ids. */
export function parseMessageIds(header: string | null | undefined): string[] {
  if (!header) return [];
  const bracketed = header.match(/<[^<>\s]+>/g);
  if (bracketed) return bracketed;
  return header
    .split(/[\s,]+/)
    .filter((t) => t.includes("@"))
    .map((t) => `<${t}>`);
}

export interface ThreadCandidate {
  threadId: string;
  participants: string[];
  lastMessageAt: Date;
}

/** Storage-side lookups, always scoped to one inbox by the caller. */
export interface ThreadLookup {
  findByMessageIds(ids: string[]): Promise<string | null>;
  findBySubject(subjectNorm: string, since: Date): Promise<ThreadCandidate[]>;
}

export interface ThreadInput {
  inReplyTo: string[];
  references: string[];
  subjectNorm: string;
  /** Lowercased addresses from From/To/Cc, excluding the inbox itself */
  participants: string[];
  date: Date;
}

export type ThreadMatch =
  | { threadId: string; matchedBy: "in-reply-to" | "references" | "subject" }
  | { threadId: null; matchedBy: null };

/**
 * Which existing thread a message belongs to:
 * 1. In-Reply-To, 2. any id in References (newest first),
 * 3. same normalized subject with at least one shared participant within 14 days.
 * Returns threadId null when the message starts a new thread.
 */
export async function resolveThread(msg: ThreadInput, lookup: ThreadLookup): Promise<ThreadMatch> {
  if (msg.inReplyTo.length) {
    const t = await lookup.findByMessageIds(msg.inReplyTo);
    if (t) return { threadId: t, matchedBy: "in-reply-to" };
  }
  if (msg.references.length) {
    const t = await lookup.findByMessageIds([...msg.references].reverse());
    if (t) return { threadId: t, matchedBy: "references" };
  }
  if (msg.subjectNorm && msg.participants.length) {
    const since = new Date(msg.date.getTime() - SUBJECT_FALLBACK_WINDOW_MS);
    const people = new Set(msg.participants.map((p) => p.toLowerCase()));
    const match = (await lookup.findBySubject(msg.subjectNorm, since))
      .filter((c) => c.lastMessageAt >= since && c.participants.some((p) => people.has(p.toLowerCase())))
      .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime())[0];
    if (match) return { threadId: match.threadId, matchedBy: "subject" };
  }
  return { threadId: null, matchedBy: null };
}
