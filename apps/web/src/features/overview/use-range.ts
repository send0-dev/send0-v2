import { useCallback } from "react";
import { useSearchParams } from "react-router";

export const RANGES = [7, 14, 30] as const;
export type Range = (typeof RANGES)[number];

/** The overview's time range (?range=7|14|30, default 14), kept in the URL. */
export function useRange(): [Range, (r: Range) => void] {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get("range"));
  const range = (RANGES as readonly number[]).includes(raw) ? (raw as Range) : 14;
  const set = useCallback((r: Range) => setParams(r === 14 ? {} : { range: String(r) }, { replace: true }), [setParams]);
  return [range, set];
}
