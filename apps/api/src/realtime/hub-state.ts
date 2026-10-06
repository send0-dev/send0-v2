import { matchesFilter, type MatchableMessage, type MessageFilter } from "@send0/core";
import type { EventEnvelope } from "@send0/pipeline";

/** Recent events kept so a `wait` that starts a moment after a message arrived still sees it. */
const RECENT_MAX = 100;
const RECENT_MAX_AGE_MS = 10 * 60 * 1000;

interface Waiter {
  filter: MessageFilter;
  sinceMs: number;
  resolve: (e: EventEnvelope | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

export type SseWrite = (chunk: string) => Promise<void> | void;

export function formatSse(e: EventEnvelope): string {
  return `id: ${e.id}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
}

function matchesWait(e: EventEnvelope, filter: MessageFilter, sinceMs: number): boolean {
  if (e.type !== "message.received" && e.type !== "message.sent") return false;
  if (Date.parse(e.created_at) < sinceMs) return false;
  return matchesFilter(e.data as unknown as MatchableMessage, { ...filter, direction: filter.direction ?? "in" });
}

/**
 * The state behind one hub (one inbox, or one org): live SSE subscribers, pending `wait`
 * calls, and a short buffer of recent events. No Cloudflare APIs, so it's testable in Node.
 */
export class HubState {
  private recent: EventEnvelope[] = [];
  private waiters = new Set<Waiter>();
  private subscribers = new Set<SseWrite>();

  constructor(private readonly now: () => number = Date.now) {}

  get subscriberCount() {
    return this.subscribers.size;
  }
  get waiterCount() {
    return this.waiters.size;
  }

  notify(e: EventEnvelope): void {
    if (this.recent.some((r) => r.id === e.id)) return; // at-least-once delivery upstream
    this.recent.push(e);
    const cutoff = this.now() - RECENT_MAX_AGE_MS;
    this.recent = this.recent.filter((r) => Date.parse(r.created_at) >= cutoff).slice(-RECENT_MAX);

    for (const w of this.waiters) {
      if (matchesWait(e, w.filter, w.sinceMs)) this.settle(w, e);
    }
    const chunk = formatSse(e);
    for (const write of this.subscribers) {
      Promise.resolve()
        .then(() => write(chunk))
        .catch(() => this.subscribers.delete(write)); // client went away
    }
  }

  /** Resolves with the first matching message event at or after `sinceMs`, or null after `timeoutMs`. */
  wait(filter: MessageFilter, sinceMs: number, timeoutMs: number): Promise<EventEnvelope | null> {
    const hit = this.recent.find((e) => matchesWait(e, filter, sinceMs));
    if (hit) return Promise.resolve(hit);
    return new Promise((resolve) => {
      const w: Waiter = { filter, sinceMs, resolve, timer: setTimeout(() => this.settle(w, null), timeoutMs) };
      this.waiters.add(w);
    });
  }

  subscribe(write: SseWrite): () => void {
    this.subscribers.add(write);
    return () => this.subscribers.delete(write);
  }

  /** Comment line that keeps proxies from closing idle SSE connections. */
  ping(): void {
    for (const write of this.subscribers) {
      Promise.resolve()
        .then(() => write(": ping\n\n"))
        .catch(() => this.subscribers.delete(write));
    }
  }

  private settle(w: Waiter, e: EventEnvelope | null) {
    if (!this.waiters.delete(w)) return;
    clearTimeout(w.timer);
    w.resolve(e);
  }
}
