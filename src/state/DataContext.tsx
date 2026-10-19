import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { loadData, rememberSavedData } from "../storage/github.js";
import type { Data } from "../domain/types.js";

interface DataState {
  data: Data | null;
  lastUpdated: string | null;
  fromCache: boolean;
  error: string | null;
  loading: boolean;
}

interface DataContextValue extends DataState {
  refresh: () => void;
  // After an admin save: show exactly what was written (CLAUDE.md §8.1).
  applySaved: (data: Data) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({
    data: null,
    lastUpdated: null,
    fromCache: false,
    error: null,
    loading: true,
  });

  const refresh = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    loadData()
      .then((loaded) => setState({ ...loaded, loading: false }))
      .catch((err) =>
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        })),
      );
  }, []);

  const applySaved = useCallback((data: Data) => {
    setState({ ...rememberSavedData(data), loading: false });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <DataContext.Provider value={{ ...state, refresh, applySaved }}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
