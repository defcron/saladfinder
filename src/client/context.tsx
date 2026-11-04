import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { api, type Config, type User } from "./api";

type AppContext = {
  config: Config | null;
  user: User | null;
  loading: boolean;
  error: string;
  refreshUser: () => Promise<void>;
  reload: () => void;
};
const Context = createContext<AppContext | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const refreshUser = async () => {
    const result = await api<{ user: User | null }>("/me");
    setUser(result.user);
  };
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([api<Config>("/config"), api<{ user: User | null }>("/me")])
      .then(([c, u]) => {
        if (active) {
          setConfig(c);
          setUser(u.user);
        }
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <Context.Provider
      value={{
        config,
        user,
        loading,
        error,
        refreshUser,
        reload: () => setAttempt((v) => v + 1),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("App context unavailable");
  return value;
}
