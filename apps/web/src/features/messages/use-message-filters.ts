import type { ListAllMessagesParams } from "@send0/sdk";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { MESSAGE_STATUSES, type MessageStatus } from "./statuses";

export interface MessageFilters {
  q: string;
  direction: "in" | "out" | "";
  status: MessageStatus | "";
  inbox: string;
}

const FILTER_KEYS = ["q", "direction", "status", "inbox"] as const;

/** The Messages page filters, kept in the URL so a filtered view can be shared and survives reloads. */
export function useMessageFilters() {
  const [params, setParams] = useSearchParams();
  const filters: MessageFilters = {
    q: params.get("q") ?? "",
    direction: (["in", "out"].includes(params.get("direction") ?? "") ? params.get("direction") : "") as MessageFilters["direction"],
    status: ((MESSAGE_STATUSES as readonly string[]).includes(params.get("status") ?? "") ? params.get("status") : "") as MessageFilters["status"],
    inbox: params.get("inbox") ?? "",
  };

  const setFilter = useCallback(
    <K extends keyof MessageFilters>(key: K, value: MessageFilters[K]) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          next.delete("message");
          return next;
        },
        { replace: true }
      ),
    [setParams]
  );

  const clear = useCallback(() => setParams({}, { replace: true }), [setParams]);
  const active = FILTER_KEYS.some((k) => !!params.get(k));
  return { filters, setFilter, clear, active };
}

/** The filters as API query params (empty ones left out). */
export function useApiFilters({ q, direction, status, inbox }: MessageFilters): ListAllMessagesParams {
  return useMemo(
    () => ({
      ...(q ? { q } : {}),
      ...(direction ? { direction } : {}),
      ...(status ? { status } : {}),
      ...(inbox ? { inbox_id: inbox } : {}),
    }),
    [q, direction, status, inbox]
  );
}

/** Which message's details are open (?message=). */
export function useOpenMessage() {
  const [params, setParams] = useSearchParams();
  const open = params.get("message");
  const setOpen = useCallback(
    (id: string | null) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("message", id);
        else next.delete("message");
        return next;
      }),
    [setParams]
  );
  return [open, setOpen] as const;
}
