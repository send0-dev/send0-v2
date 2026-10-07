import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { BlobReader, BlobStore, PutOptions, StoredBlob } from "../blob/types";

const META_SUFFIX = ".meta.json";
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._=@+-]*$/;

/** Blob store on local disk (self-host on Node). Keys map to files under `rootDir`; metadata sits in a sidecar. */
export class FsBlobStore implements BlobStore, BlobReader {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  /** Resolves a key to a path inside the root, or throws. Each segment must match a strict allowlist. */
  private resolve(key: string): string {
    const bad = () => new Error(`Invalid blob key: ${JSON.stringify(key)}`);
    if (!key || key.toLowerCase().endsWith(META_SUFFIX)) throw bad();
    if (!key.split("/").every((seg) => SEGMENT.test(seg))) throw bad();
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw bad();
    return full;
  }

  /** Throws unless the real (symlink-resolved) directory is inside the real root. */
  private async assertInside(dir: string): Promise<void> {
    const [realRoot, realDir] = await Promise.all([realpath(this.root), realpath(dir)]);
    if (realDir !== realRoot && !realDir.startsWith(realRoot + path.sep)) throw new Error("Blob path escapes the storage root");
  }

  /** Writes via a temp file in the same directory, then renames, so readers never see partial files. */
  private async writeAtomic(file: string, data: Uint8Array | string): Promise<void> {
    const tmp = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(tmp, data, { flag: "wx" });
      await rename(tmp, file);
    } catch (err) {
      await rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
  }

  async put(key: string, body: Uint8Array<ArrayBuffer>, opts: PutOptions): Promise<void> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await this.assertInside(path.dirname(file));
    // Sidecar first: a body never exists without its metadata.
    await this.writeAtomic(file + META_SUFFIX, JSON.stringify({ contentType: opts.contentType, metadata: opts.metadata ?? {} }));
    await this.writeAtomic(file, body);
  }

  /** Removes each file and its metadata sidecar. Missing files are fine; empty directories are left behind. */
  async delete(keys: string[]): Promise<void> {
    for (const key of keys) {
      const file = this.resolve(key);
      try {
        await this.assertInside(path.dirname(file));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw err;
      }
      // Body first: a sidecar without its body is harmless, the reverse would serve without a content type.
      await rm(file, { force: true });
      await rm(file + META_SUFFIX, { force: true });
    }
  }

  async get(key: string): Promise<StoredBlob | null> {
    const file = this.resolve(key);
    try {
      await this.assertInside(path.dirname(file));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
    let fh;
    try {
      fh = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
    try {
      const st = await fh.stat();
      if (!st.isFile()) {
        await fh.close();
        return null;
      }
      let contentType: string | null = null;
      try {
        const meta = JSON.parse(await readFile(file + META_SUFFIX, "utf8")) as { contentType?: unknown };
        if (typeof meta.contentType === "string") contentType = meta.contentType;
      } catch {
        // no sidecar: serve without a stored content type
      }
      // The stream owns the handle and closes it on end, error or cancel.
      return { body: Readable.toWeb(fh.createReadStream()) as unknown as ReadableStream<Uint8Array>, contentType, size: st.size };
    } catch (err) {
      await fh.close().catch(() => {});
      throw err;
    }
  }
}
