import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeChoice = "system" | "light" | "dark";
const STORAGE_KEY = "send0-theme";

interface ThemeValue {
  choice: ThemeChoice;
  resolved: "light" | "dark";
  setChoice: (c: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

const systemDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
const readChoice = (): ThemeChoice => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
};

/** Light, dark or follow the system. index.html applies the class before React loads, so there's no flash. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readChoice);
  const [dark, setDark] = useState(() => (choice === "system" ? systemDark() : choice === "dark"));

  useEffect(() => {
    if (choice !== "system") return setDark(choice === "dark");
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setDark(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [choice]);

  useEffect(() => void document.documentElement.classList.toggle("dark", dark), [dark]);

  const setChoice = useCallback((c: ThemeChoice) => {
    setChoiceState(c);
    try {
      if (c === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, c);
    } catch {
      /* private mode: the choice lasts for this tab */
    }
  }, []);

  const value = useMemo(() => ({ choice, resolved: dark ? ("dark" as const) : ("light" as const), setChoice }), [choice, dark, setChoice]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error("useTheme must be used inside <ThemeProvider>");
  return v;
}
