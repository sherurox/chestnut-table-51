import type { FinishedEntry, LocalGame } from "../domain/liveGame.js";
import { browserStore, LIVE_GAME_KEY, notifyLocalChange, SYNC_QUEUE_KEY, type KeyValueStore } from "./localKeys.js";

// Live-game autosave and the "Not synced" queue (CLAUDE.md §9). Every change is written immediately; no
// network involved. Unreadable entries are set aside under "<key>.corrupt" instead of being deleted, so a
// game is never silently dropped.

export class StorageUnavailableError extends Error {
  constructor() {
    super("This browser won't let CT51 save on the phone, so the game can't be autosaved. Try the home-screen app.");
    this.name = "StorageUnavailableError";
  }
}

function storeOrThrow(store: KeyValueStore | null | undefined): KeyValueStore {
  const s = store === undefined ? browserStore() : store;
  if (!s) throw new StorageUnavailableError();
  return s;
}

function setAside(store: KeyValueStore, key: string, raw: string): void {
  try {
    store.setItem(`${key}.corrupt`, raw);
  } catch {
    // nothing more we can do; keep the original in place
    return;
  }
  store.removeItem(key);
}

function looksLikeLocalGame(value: unknown): value is LocalGame {
  const g = value as Partial<LocalGame> | null;
  return (
    !!g &&
    g.v === 1 &&
    typeof g.id === "string" &&
    typeof g.seasonId === "string" &&
    Array.isArray(g.startPlayers) &&
    Array.isArray(g.actions) &&
    typeof g.finalStacks === "object"
  );
}

function looksLikeEntry(value: unknown): value is FinishedEntry {
  const e = value as Partial<FinishedEntry> | null;
  return !!e && typeof e.game?.id === "string" && Array.isArray(e.promote);
}

export function loadLocalGame(store?: KeyValueStore | null): LocalGame | null {
  const s = store === undefined ? browserStore() : store;
  if (!s) return null;
  const raw = s.getItem(LIVE_GAME_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (looksLikeLocalGame(parsed)) return parsed;
  } catch {
    // fall through
  }
  setAside(s, LIVE_GAME_KEY, raw);
  return null;
}

// Throws if the phone refuses to store it (full or blocked), so the UI can say the change wasn't saved.
export function saveLocalGame(game: LocalGame, store?: KeyValueStore | null): void {
  storeOrThrow(store).setItem(LIVE_GAME_KEY, JSON.stringify(game));
  notifyLocalChange();
}

export function clearLocalGame(store?: KeyValueStore | null): void {
  storeOrThrow(store).removeItem(LIVE_GAME_KEY);
  notifyLocalChange();
}

export function loadQueue(store?: KeyValueStore | null): FinishedEntry[] {
  const s = store === undefined ? browserStore() : store;
  if (!s) return [];
  const raw = s.getItem(SYNC_QUEUE_KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every(looksLikeEntry)) return parsed;
  } catch {
    // fall through
  }
  setAside(s, SYNC_QUEUE_KEY, raw);
  return [];
}

function writeQueue(store: KeyValueStore, queue: FinishedEntry[]): void {
  if (queue.length === 0) store.removeItem(SYNC_QUEUE_KEY);
  else store.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  notifyLocalChange();
}

// Finishing a game: queue it first, then clear the live game. If the phone dies in between, both exist and
// `reconcileLocal` drops the live copy on next open — the queued copy is the one that syncs.
export function moveToQueue(entry: FinishedEntry, store?: KeyValueStore | null): void {
  const s = storeOrThrow(store);
  const queue = loadQueue(s).filter((e) => e.game.id !== entry.game.id);
  writeQueue(s, [...queue, entry]);
  if (loadLocalGame(s)?.id === entry.game.id) s.removeItem(LIVE_GAME_KEY);
  notifyLocalChange();
}

export function removeFromQueue(gameId: string, store?: KeyValueStore | null): void {
  const s = storeOrThrow(store);
  writeQueue(s, loadQueue(s).filter((e) => e.game.id !== gameId));
}

export function reconcileLocal(store?: KeyValueStore | null): void {
  const s = store === undefined ? browserStore() : store;
  if (!s) return;
  const game = loadLocalGame(s);
  if (game && loadQueue(s).some((e) => e.game.id === game.id)) clearLocalGame(s);
}
