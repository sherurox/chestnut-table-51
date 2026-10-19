import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { FinishedEntry, LocalGame } from "../domain/liveGame.js";
import { loadLocalGame, loadQueue, saveLocalGame } from "../storage/localGame.js";
import { browserStore, LIVE_GAME_KEY, SYNC_QUEUE_KEY, subscribeLocalChange } from "../storage/localKeys.js";

function rawItem(key: string): string | null {
  try {
    return browserStore()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

// The live game on this phone, re-rendered whenever it changes (this tab or another).
export function useLocalGame(): LocalGame | null {
  const raw = useSyncExternalStore(subscribeLocalChange, () => rawItem(LIVE_GAME_KEY));
  // `raw` is only the cache key: re-parse when the stored string changes.
  return useMemo(() => loadLocalGame(), [raw]);
}

export function useQueue(): FinishedEntry[] {
  const raw = useSyncExternalStore(subscribeLocalChange, () => rawItem(SYNC_QUEUE_KEY));
  // `raw` is only the cache key: re-parse when the stored string changes.
  return useMemo(() => loadQueue(), [raw]);
}

// Applies an edit to the freshest stored game and autosaves it immediately (CLAUDE.md §9.4).
// Rule violations and storage failures surface as `error` instead of being swallowed.
export function useGameUpdater() {
  const [error, setError] = useState<string | null>(null);
  const update = useCallback((edit: (game: LocalGame) => LocalGame): boolean => {
    try {
      const current = loadLocalGame();
      if (!current) throw new Error("No game in progress on this phone.");
      saveLocalGame(edit(current));
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that change.");
      return false;
    }
  }, []);
  return { update, error, setError };
}
