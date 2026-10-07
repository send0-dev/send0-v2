import { Hono } from "hono";
import { ApiError, notFound } from "../errors";
import type { AppEnv } from "../types";

/** `attachment; filename="ascii"; filename*=UTF-8''percent-encoded` (RFC 6266 / 5987). */
export function contentDisposition(filename: string | null): string {
  if (!filename) return "attachment";
  const name = (filename as string & { toWellFormed(): string }).toWellFormed();
  const fallback = name.replace(/[^\x20-\x7e]|["\\%]/g, "_");
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

const CONTENT_TYPE = /^[\w.+-]+\/[\w.+-]+(\s*;[^\r\n]*)?$/;
const validType = (t: string | null): string | null => (t && CONTENT_TYPE.test(t) ? t : null);

/** Mounted at /v1/files, outside API-key auth: the signed token in the URL is the credential. */
export const fileRoutes = new Hono<AppEnv>().get("/:token", async (c) => {
  const server = c.get("deps").fileServer;
  if (!server) throw new ApiError(404, "route_not_found", `No route ${c.req.method} ${c.req.path}.`);
  const link = await server.signer.verify(c.req.param("token"));
  if (!link) throw new ApiError(403, "invalid_link", "This download link is invalid or has expired.");
  const blob = await server.reader.get(link.key);
  if (!blob) throw notFound("file");
  const headers: Record<string, string> = {
    "content-type": validType(link.contentType) ?? validType(blob.contentType) ?? "application/octet-stream",
    "content-disposition": contentDisposition(link.filename),
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
  if (blob.size !== null) headers["content-length"] = String(blob.size);
  return new Response(blob.body, { headers });
});
