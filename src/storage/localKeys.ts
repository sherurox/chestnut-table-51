// localStorage keys for the admin's live game and sync queue (CLAUDE.md §9). Kept tiny and free of admin
// code so the viewer shell can show a "Not synced" badge and warm the admin chunk on the admin's phone
// without shipping admin code to viewers.

export const LIVE_GAME_KEY = "ct51.liveGame";
export const SYNC_QUEUE_KEY = "ct51.syncQueue";
// Not secret: only says "this device has logged in as admin before" (used to keep admin code cached offline).
export const ADMIN_DEVICE_KEY = "ct51.adminDevice";

const CHANGE_EVENT = "ct51-local-change";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // storage blocked (e.g. some private modes)
  }
}

export function notifyLocalChange(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeLocalChange(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener); // other tabs
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

function safeGet(key: string): string | null {
  try {
    return browserStore()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function queuedCount(): number {
  try {
    const parsed: unknown = JSON.parse(safeGet(SYNC_QUEUE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export function hasLocalGame(): boolean {
  return safeGet(LIVE_GAME_KEY) !== null;
}

// True on a phone that runs games: it has (or had) admin state. Viewers never set any of these keys.
export function isAdminDevice(): boolean {
  return hasLocalGame() || queuedCount() > 0 || safeGet(ADMIN_DEVICE_KEY) !== null;
}
