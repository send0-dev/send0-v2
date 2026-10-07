import { describe, expect, it } from "vitest";
import { Semaphore } from "../src/semaphore";

describe("Semaphore", () => {
  it("runs at most `limit` tasks at once, in arrival order, and frees slots on failure", async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let peak = 0;
    const order: number[] = [];
    const task = (n: number, fail = false) =>
      sem.run(async () => {
        peak = Math.max(peak, ++active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
        order.push(n);
        if (fail) throw new Error(`task ${n}`);
        return n;
      });
    const results = await Promise.allSettled([task(1, true), task(2), task(3), task(4)]);
    expect(peak).toBe(2);
    expect(order).toEqual([1, 2, 3, 4]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "fulfilled", "fulfilled", "fulfilled"]);
    expect(await task(5)).toBe(5);
  });
});
