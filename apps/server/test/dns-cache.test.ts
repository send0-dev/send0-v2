import { describe, expect, it } from "vitest";
import { cachingResolver } from "../src/dns-cache";

const notFound = () => Object.assign(new Error("queryTxt ENOTFOUND example.com"), { code: "ENOTFOUND" });

describe("cachingResolver", () => {
  it("answers repeat lookups from the cache until the TTL passes", async () => {
    let now = 0;
    let calls = 0;
    const resolve = cachingResolver({
      resolve: async (name, type) => (calls++, [[`${type} ${name}`]]),
      ttlMs: 1000,
      now: () => now,
    });
    expect(await resolve("example.com", "TXT")).toEqual([["TXT example.com"]]);
    expect(await resolve("example.com", "TXT")).toEqual([["TXT example.com"]]);
    expect(calls).toBe(1);
    await resolve("example.com", "MX");
    expect(calls).toBe(2);
    now = 1001;
    await resolve("example.com", "TXT");
    expect(calls).toBe(3);
  });

  it("caches 'no such record' answers but not transient failures", async () => {
    let calls = 0;
    const resolve = cachingResolver({
      resolve: async (name) => {
        calls++;
        throw name === "gone.example" ? notFound() : Object.assign(new Error("timeout"), { code: "ETIMEOUT" });
      },
    });
    await expect(resolve("gone.example", "TXT")).rejects.toMatchObject({ code: "ENOTFOUND" });
    await expect(resolve("gone.example", "TXT")).rejects.toMatchObject({ code: "ENOTFOUND" });
    expect(calls).toBe(1);
    await expect(resolve("slow.example", "TXT")).rejects.toMatchObject({ code: "ETIMEOUT" });
    await expect(resolve("slow.example", "TXT")).rejects.toMatchObject({ code: "ETIMEOUT" });
    expect(calls).toBe(3);
  });

  it("stays bounded, evicting the oldest entries", async () => {
    let calls = 0;
    const resolve = cachingResolver({ resolve: async () => (calls++, []), maxEntries: 2 });
    await resolve("a.example", "TXT");
    await resolve("b.example", "TXT");
    await resolve("c.example", "TXT");
    await resolve("c.example", "TXT");
    expect(calls).toBe(3);
    await resolve("a.example", "TXT");
    expect(calls).toBe(4);
  });
});
