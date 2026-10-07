import { afterEach, describe, expect, it, vi } from "vitest";
import { BackgroundTasks } from "../src/background";

describe("BackgroundTasks", () => {
  afterEach(() => vi.restoreAllMocks());

  it("drains tracked work, including work added while draining", async () => {
    const tasks = new BackgroundTasks();
    const done: string[] = [];
    tasks.waitUntil(
      new Promise<void>((r) =>
        setTimeout(() => {
          done.push("a");
          tasks.waitUntil(new Promise<void>((r2) => setTimeout(() => (done.push("b"), r2()), 5)));
          r();
        }, 5),
      ),
    );
    expect(tasks.size).toBe(1);
    await tasks.drain();
    expect(done).toEqual(["a", "b"]);
    expect(tasks.size).toBe(0);
  });

  it("logs failures instead of throwing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const tasks = new BackgroundTasks();
    tasks.waitUntil(Promise.reject(new Error("boom")));
    await tasks.drain();
    expect(JSON.parse(log.mock.calls[0]![0] as string)).toEqual({ event: "background.error", error: "Error: boom" });
  });
});
