import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useData } from "../state/DataContext.js";
import { isLoggedIn } from "../storage/auth.js";
import { saveChange } from "../storage/githubWrite.js";
import { loadLocalGame, loadQueue, reconcileLocal } from "../storage/localGame.js";
import { syncAll, type SyncedGame } from "../storage/sync.js";
import { useLoggedIn } from "./ui.js";

// Drives storage/sync.ts from the admin UI (CLAUDE.md §9.7): syncs on login, when Admin home opens, when
// the phone comes back online, and on "Sync now". Needs login, because the token is gone after a reload.

interface SyncContextValue {
  syncing: boolean;
  error: string | null;
  recent: SyncedGame[]; // games synced this session, for "Share results"
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

function hasWork(): boolean {
  const local = loadLocalGame();
  return loadQueue().length > 0 || (local !== null && !local.markerSynced);
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const loggedIn = useLoggedIn();
  const { applySaved } = useData();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<SyncedGame[]>([]);

  const running = useRef<Promise<void> | null>(null);

  const syncNow = useCallback((): Promise<void> => {
    if (running.current) return running.current; // login + Admin home can both ask at once
    if (!isLoggedIn() || !hasWork()) return Promise.resolve();
    setSyncing(true);
    running.current = (async () => {
      try {
        const report = await syncAll({ save: saveChange });
        if (report.data) applySaved(report.data);
        if (report.synced.length > 0) setRecent((r) => [...report.synced, ...r]);
        setError(report.error);
      } finally {
        running.current = null;
        setSyncing(false);
      }
    })();
    return running.current;
  }, [applySaved]);

  useEffect(() => {
    reconcileLocal();
  }, []);

  useEffect(() => {
    if (loggedIn) void syncNow();
  }, [loggedIn, syncNow]);

  useEffect(() => {
    const onOnline = () => void syncNow();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [syncNow]);

  return <SyncContext.Provider value={{ syncing, error, recent, syncNow }}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within SyncProvider");
  return ctx;
}
