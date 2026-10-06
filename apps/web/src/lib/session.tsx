import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { http, type Me } from "./api";

interface SessionValue {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<Me | null>;
}

const SessionContext = createContext<SessionValue>({
  me: null,
  loading: true,
  refresh: async () => null,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const { user } = await http.get<{ user: Me | null }>("/auth/me");
    setMe(user);
    setLoading(false);
    return user;
  }, []);
  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, [refresh]);
  return (
    <SessionContext.Provider value={{ me, loading, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
