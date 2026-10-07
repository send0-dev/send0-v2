import { describe, expect, it } from "vitest";
import { bootGate, BootTimeoutError } from "../src/boot";

const never = () => new Promise<void>(() => {});

describe("bootGate", () => {
  it("lets every caller run its own boot until one succeeds, then skips it", async () => {
    const boot = bootGate(1_000);
    let runs = 0;
    const task = async () => {
      runs++;
      await new Promise((r) => setTimeout(r, 5));
    };
    // Nothing in flight is shared: concurrent callers each run (the advisory lock serialises them).
    await Promise.all([boot(task), boot(task)]);
    expect(runs).toBe(2);
    await boot(task);
    expect(runs).toBe(2);
    expect(boot.booted).toBe(true);
  });

  it("retries after a failure", async () => {
    const boot = bootGate(1_000);
    let runs = 0;
    const flaky = async () => {
      if (++runs === 1) throw new Error("database asleep");
    };
    await expect(boot(flaky)).rejects.toThrow("database asleep");
    expect(boot.booted).toBe(false);
    await boot(flaky);
    await boot(flaky);
    expect(runs).toBe(2);
  });

  it("gives up on a boot that hangs, without blocking the next caller", async () => {
    const boot = bootGate(50);
    const hung = boot(never);
    await boot(async () => {});
    expect(boot.booted).toBe(true);
    await expect(hung).rejects.toBeInstanceOf(BootTimeoutError);
  });
});
