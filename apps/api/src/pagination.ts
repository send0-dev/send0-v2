import { and, desc, eq, lt, or, type AnyColumn, type SQL } from "drizzle-orm";
import { z } from "zod";
import { invalid } from "./errors";

export const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(200).optional(),
});

interface Cursor {
  at: Date;
  id: string;
}

const encode = (c: Cursor) => btoa(`${c.at.toISOString()}|${c.id}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function decode(raw: string): Cursor {
  try {
    const [iso, id] = atob(raw.replace(/-/g, "+").replace(/_/g, "/")).split("|");
    const at = new Date(iso!);
    if (!id || Number.isNaN(at.getTime())) throw new Error();
    return { at, id };
  } catch {
    throw invalid("cursor is not valid. Pass the next_cursor value from the previous page.", "cursor");
  }
}

/** Newest-first keyset pagination on (timestamp, id). Stable under concurrent inserts. */
export function pageWhere(cursor: string | undefined, at: AnyColumn, id: AnyColumn): SQL | undefined {
  if (!cursor) return undefined;
  const c = decode(cursor);
  return or(lt(at, c.at), and(eq(at, c.at), lt(id, c.id)));
}

export const pageOrder = (at: AnyColumn, id: AnyColumn) => [desc(at), desc(id)];

/** Fetch limit + 1 rows, then call this to build the page. */
export function toPage<T, R>(rows: T[], limit: number, cursorOf: (row: T) => Cursor, serialize: (row: T) => R) {
  const more = rows.length > limit;
  const page = more ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    object: "list" as const,
    data: page.map(serialize),
    next_cursor: more && last ? encode(cursorOf(last)) : null,
  };
}
