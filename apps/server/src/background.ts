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

  /**
   * Resolves once every tracked task (including ones added while draining) has settled, or after
   * `timeoutMs`, whichever is first. Never rejects. Returns false when it gave up with work still running.
   */
  async drain(timeoutMs = Infinity): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<false>((resolve) => {
      if (Number.isFinite(timeoutMs)) timer = setTimeout(() => resolve(false), timeoutMs);
    });
    const settled = (async () => {
      while (this.pending.size) await Promise.all(this.pending);
      return true as const;
    })();
    try {
      return await Promise.race([settled, expired]);
    } finally {
      clearTimeout(timer);
    }
  }
}
