import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { BlobReader, BlobStore, PutOptions, StoredBlob } from "../blob/types";

const META_SUFFIX = ".meta.json";

/** Blob store on local disk (self-host on Node). Keys map to files under `rootDir`; metadata sits in a sidecar. */
export class FsBlobStore implements BlobStore, BlobReader {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  /** Resolves a key to a path inside the root, or throws. */
  private resolve(key: string): string {
    if (!key || key.includes("\0") || key.includes("\\") || key.startsWith("/") || path.isAbsolute(key) || key.endsWith(META_SUFFIX)) {
      throw new Error(`Invalid blob key: ${JSON.stringify(key)}`);
    }
    if (key.split("/").some((seg) => seg === ".." || seg === "." || seg === ""))
      throw new Error(`Invalid blob key: ${JSON.stringify(key)}`);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error(`Invalid blob key: ${JSON.stringify(key)}`);
    return full;
  }

  /** Writes via a temp file in the same directory, then renames, so readers never see partial files. */
  private async writeAtomic(file: string, data: Uint8Array | string): Promise<void> {
    const tmp = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(tmp, data);
      await rename(tmp, file);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
  }

  async put(key: string, body: Uint8Array<ArrayBuffer>, opts: PutOptions): Promise<void> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await this.writeAtomic(file, body);
    await this.writeAtomic(file + META_SUFFIX, JSON.stringify({ contentType: opts.contentType, metadata: opts.metadata ?? {} }));
  }

  async get(key: string): Promise<StoredBlob | null> {
    const file = this.resolve(key);
    let size: number;
    try {
      const s = await stat(file);
      if (!s.isFile()) return null;
      size = s.size;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
    let contentType: string | null = null;
    try {
      const meta = JSON.parse(await readFile(file + META_SUFFIX, "utf8")) as { contentType?: unknown };
      if (typeof meta.contentType === "string") contentType = meta.contentType;
    } catch {
      // no sidecar: serve without a stored content type
    }
    return { body: Readable.toWeb(createReadStream(file)) as unknown as ReadableStream<Uint8Array>, contentType, size };
  }
}
