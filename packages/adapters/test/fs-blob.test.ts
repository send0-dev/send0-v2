import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
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
    const bad = [
      "../secret.txt",
      "a/../../secret.txt",
      "/etc/passwd",
      "a\\b",
      "a\0b",
      "x.meta.json",
      "a/x.meta.json",
      "",
      "a//b",
      "./a",
      "a:stream",
      "x.META.JSON",
      ".hidden",
      "a/.b",
      "a b",
      "a/b/",
    ];
    for (const k of bad) {
      await expect(store.put(k, bytes("x"), { contentType: "text/plain" }), `put ${JSON.stringify(k)}`).rejects.toThrow();
      await expect(store.get(k), `get ${JSON.stringify(k)}`).rejects.toThrow();
    }
  });

  it("accepts reserved-looking names under the allowlist", async () => {
    await store.put("CON", bytes("x"), { contentType: "text/plain" });
    expect(await new Response((await store.get("CON"))!.body).text()).toBe("x");
  });

  it("rejects symlinked directories pointing outside root", async () => {
    const outside = path.join(dir, "outside");
    await mkdir(outside);
    await writeFile(path.join(outside, "f"), "secret");
    await mkdir(path.join(dir, "root"), { recursive: true });
    await symlink(outside, path.join(dir, "root/link"));
    await expect(store.get("link/f")).rejects.toThrow();
    await expect(store.put("link/new", bytes("x"), { contentType: "text/plain" })).rejects.toThrow();
    expect(await readdir(outside)).toEqual(["f"]);
  });

  it("rejects a symlinked file", async () => {
    await writeFile(path.join(dir, "secret.txt"), "secret");
    await mkdir(path.join(dir, "root"), { recursive: true });
    await symlink(path.join(dir, "secret.txt"), path.join(dir, "root/file"));
    await expect(store.get("file")).rejects.toThrow();
  });

  it("writes body and sidecar with no temp files left", async () => {
    await store.put("d/k", bytes("x"), { contentType: "text/plain" });
    expect((await readdir(path.join(dir, "root/d"))).sort()).toEqual(["k", "k.meta.json"]);
  });

  it("cancelling the stream releases the file", async () => {
    await store.put("big", new Uint8Array(1 << 20), { contentType: "application/octet-stream" });
    const stored = (await store.get("big"))!;
    await stored.body.cancel();
    await rm(path.join(dir, "root"), { recursive: true, force: true });
  });
});
