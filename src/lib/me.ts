import type { Data, ID } from "../domain/types.js";
import type { KeyValueStore } from "../storage/localKeys.js";

export const ME_KEY = "ct51.me";

// ct51.me can outlive its player (the test data was wiped on 2026-10-20, CLAUDE.md §12). Once data has
// loaded, a pick that isn't a player in it is no pick at all. Archived players still count.
export function validMe(stored: ID | null, data: Data | null): ID | null {
  if (stored === null || data === null) return stored;
  return data.players.some((p) => p.id === stored) ? stored : null;
}

// Applies validMe to the stored key: a stale pick is removed. Returns the pick that stands.
export function forgetStaleMe(data: Data | null, store: Pick<KeyValueStore, "getItem" | "removeItem"> | null): ID | null {
  try {
    const stored = store?.getItem(ME_KEY) ?? null;
    const me = validMe(stored, data);
    if (stored !== null && me === null) store?.removeItem(ME_KEY);
    return me;
  } catch {
    return null; // storage blocked: no pick
  }
}
