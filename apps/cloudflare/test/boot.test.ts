import { describe, expect, it } from "vitest";
import { onceUntilSuccess } from "../src/boot";

describe("onceUntilSuccess", () => {
  it("shares one run between concurrent callers and never repeats a success", async () => {
    const once = onceUntilSuccess();
    let runs = 0;
    const task = async () => {
      runs++;
      await new Promise((r) => setTimeout(r, 5));
    };
    await Promise.all([once(task), once(task), once(task)]);
    await once(task);
    expect(runs).toBe(1);
  });

  it("retries after a failure", async () => {
    const once = onceUntilSuccess();
    let runs = 0;
    const flaky = async () => {
      if (++runs === 1) throw new Error("database asleep");
    };
    await expect(Promise.all([once(flaky), once(flaky)])).rejects.toThrow("database asleep");
    expect(runs).toBe(1);
    await once(flaky);
    await once(flaky);
    expect(runs).toBe(2);
  });
});
