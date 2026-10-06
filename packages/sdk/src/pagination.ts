/** One page of results. Iterate it with for-await to walk every page automatically. */
export class Page<T> implements AsyncIterable<T> {
  constructor(
    readonly data: T[],
    readonly nextCursor: string | null,
    private readonly fetchNext: (cursor: string) => Promise<Page<T>>
  ) {}

  get hasMore(): boolean {
    return this.nextCursor !== null;
  }

  async next(): Promise<Page<T> | null> {
    return this.nextCursor ? this.fetchNext(this.nextCursor) : null;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let page: Page<T> | null = this;
    while (page) {
      yield* page.data;
      page = await page.next();
    }
  }
}
