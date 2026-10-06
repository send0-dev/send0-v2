import { createContext, useContext } from "react";

/** Lets a page's header open the sidebar on phones, where it lives in a sheet. */
export const ShellContext = createContext<{ openSidebar: () => void }>({ openSidebar: () => {} });
export const useShell = () => useContext(ShellContext);
