import { useHotkeys } from "./use-hotkeys";

/**
 * j/k (and ↓/↑) move through `ids`; Enter opens the current one; Escape clears it.
 * `current` is the selected id (or null); `onMove` selects; `onOpen` is for Enter when it differs.
 */
export function useListNavigation({
  ids,
  current,
  onMove,
  onOpen,
  onEscape,
  enabled = true,
}: {
  ids: string[];
  current: string | null;
  onMove: (id: string) => void;
  onOpen?: (id: string) => void;
  onEscape?: () => void;
  enabled?: boolean;
}) {
  const step = (delta: number) => {
    if (!ids.length) return;
    const i = current ? ids.indexOf(current) : -1;
    const next = ids[Math.min(ids.length - 1, Math.max(0, i === -1 ? 0 : i + delta))]!;
    onMove(next);
    document.querySelector(`[data-nav-id="${CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest" });
  };
  useHotkeys(
    {
      j: () => step(1),
      ArrowDown: () => step(1),
      k: () => step(-1),
      ArrowUp: () => step(-1),
      Enter: () => current && (onOpen ?? onMove)(current),
      Escape: () => onEscape?.(),
    },
    enabled,
  );
}
