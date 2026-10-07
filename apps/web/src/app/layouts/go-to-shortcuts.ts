import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { MAIN_NAV, WORKSPACE_NAV } from "./nav-items";

/** Linear-style navigation: press G, then a letter (G O overview, G M messages, …). */
export function useGoToShortcuts() {
  const navigate = useNavigate();
  const armed = useRef<number | null>(null);
  useEffect(() => {
    const targets = new Map([...MAIN_NAV, ...WORKSPACE_NAV, { to: "/inboxes", key: "i" }].filter((i) => i.key).map((i) => [i.key!, i.to]));
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
      if (armed.current && targets.has(e.key)) {
        e.preventDefault();
        window.clearTimeout(armed.current);
        armed.current = null;
        void navigate(targets.get(e.key)!);
        return;
      }
      if (e.key === "g") armed.current = window.setTimeout(() => (armed.current = null), 900);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
}
