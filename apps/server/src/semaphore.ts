/** Lets at most `limit` tasks run at once; the rest wait their turn in arrival order. */
export class Semaphore {
  private active = 0;
  private readonly waiters: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  /** Runs `task` once a slot is free and frees the slot when it settles. */
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active < this.limit) this.active++;
    // A releasing task hands its slot straight to us, so `active` stays put.
    else await new Promise<void>((resolve) => this.waiters.push(resolve));
    try {
      return await task();
    } finally {
      const next = this.waiters.shift();
      if (next) next();
      else this.active--;
    }
  }
}
