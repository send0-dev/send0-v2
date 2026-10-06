import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

interface CommandMenuValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const CommandMenuContext = createContext<CommandMenuValue | null>(null);

/** Open state for the ⌘K menu, and the keyboard shortcut (⌘K / Ctrl+K) that toggles it. */
export function CommandMenuProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <CommandMenuContext.Provider value={value}>{children}</CommandMenuContext.Provider>;
}

export function useCommandMenu(): CommandMenuValue {
  const v = useContext(CommandMenuContext);
  if (!v) throw new Error("useCommandMenu must be used inside <CommandMenuProvider>");
  return v;
}
