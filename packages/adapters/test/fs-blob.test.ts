import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsBlobStore } from "../src/node/fs-blob";

let dir: string;
let store: FsBlobStore;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "send0-fs-"));
  store = new FsBlobStore(path.join(dir, "root"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const bytes = (s: string) => new TextEncoder().encode(s);

describe("FsBlobStore", () => {
  it("stores and streams back with content type and size", async () => {
    await store.put("raw/org/msg_1.eml", bytes("hello"), { contentType: "message/rfc822", metadata: { a: "b" } });
    const got = (await store.get("raw/org/msg_1.eml"))!;
    expect(got.contentType).toBe("message/rfc822");
    expect(got.size).toBe(5);
    expect(await new Response(got.body).text()).toBe("hello");
    const meta = JSON.parse(await readFile(path.join(dir, "root/raw/org/msg_1.eml.meta.json"), "utf8"));
    expect(meta).toEqual({ contentType: "message/rfc822", metadata: { a: "b" } });
  });

  it("overwrites and leaves no temp files", async () => {
    await store.put("a/b", bytes("one"), { contentType: "text/plain" });
    await store.put("a/b", bytes("two"), { contentType: "text/plain" });
    expect(await new Response((await store.get("a/b"))!.body).text()).toBe("two");
    expect((await readdir(path.join(dir, "root/a"))).sort()).toEqual(["b", "b.meta.json"]);
  });

  it("returns null for a missing key", async () => {
    expect(await store.get("nope/x")).toBeNull();
  });

  it("tolerates a missing sidecar", async () => {
    await store.put("k", bytes("x"), { contentType: "text/plain" });
    await rm(path.join(dir, "root/k.meta.json"));
    expect((await store.get("k"))!.contentType).toBeNull();
  });

  it("rejects unsafe keys", async () => {
    await writeFile(path.join(dir, "secret.txt"), "top secret");
    const bad = ["../secret.txt", "a/../../secret.txt", "/etc/passwd", "a\\b", "a\0b", "x.meta.json", "a/x.meta.json", "", "a//b", "./a"];
    for (const k of bad) {
      await expect(store.put(k, bytes("x"), { contentType: "text/plain" }), `put ${JSON.stringify(k)}`).rejects.toThrow();
      await expect(store.get(k), `get ${JSON.stringify(k)}`).rejects.toThrow();
    }
  });
});
