/**
 * Work deferred past a response (`waitUntil` on Workers). Node has no request context to hold it,
 * so promises are tracked here and drained on shutdown. Failures are logged, never thrown.
 */
export class BackgroundTasks {
  private readonly pending = new Set<Promise<unknown>>();

  /** Tracks `p` until it settles; a rejection is logged as JSON. */
  readonly waitUntil = (p: Promise<unknown>): void => {
    const tracked = p
      .catch((err: unknown) => console.error(JSON.stringify({ event: "background.error", error: String(err) })))
      .finally(() => this.pending.delete(tracked));
    this.pending.add(tracked);
  };

  /** How many tasks are still running. */
  get size(): number {
    return this.pending.size;
  }

  /** Resolves once every tracked task (including ones added while draining) has settled. */
  async drain(): Promise<void> {
    while (this.pending.size) await Promise.all(this.pending);
  }
}
