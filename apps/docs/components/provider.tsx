"use client";
import SearchDialog from "@/components/search";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";

const theme = { storageKey: "send0-theme", attribute: ["class", "data-theme"] as ("class" | "data-theme")[] };

export function Provider({ children }: { children: ReactNode }) {
  return (
    <RootProvider search={{ SearchDialog }} theme={theme}>
      {children}
    </RootProvider>
  );
}
