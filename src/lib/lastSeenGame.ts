import type { Data, ID } from "../domain/types.js";
import { visibleGames } from "./selectors.js";

// Rank arrows pulse once on Home after a new season game. The last game this phone has seen is kept in
// localStorage (non-secret, display only).
export const LAST_SEEN_GAME_KEY = "ct51.lastSeenGame";

// The newest finished season-mode game in the season (incognito and deleted games never count).
export function latestSeasonGameId(data: Data, seasonId: ID): ID | null {
  return visibleGames(data, seasonId).find((g) => g.mode === "season")?.id ?? null;
}

// stored: what this phone saw last (null = first ever visit). latest: the newest game now.
// First visit: no pulse, just remember. Same game: nothing. A different game: pulse once and remember it.
export function lastSeenDecision(stored: ID | null, latest: ID | null): { pulse: boolean; store: ID | null } {
  if (latest === null || stored === latest) return { pulse: false, store: null };
  return { pulse: stored !== null, store: latest };
}

// Reads the key, applies the decision and writes the key. Returns whether to pulse.
// isGame: a stored id that is no game in the data (the test data was wiped on 2026-10-20) is forgotten,
// so this phone acts like one that never saw a game: the next game is remembered without a pulse.
export function checkLastSeenGame(
  latest: ID | null,
  store: (Pick<Storage, "getItem" | "setItem"> & Partial<Pick<Storage, "removeItem">>) | null,
  isGame: (id: ID) => boolean = () => true,
): boolean {
  try {
    let stored = store?.getItem(LAST_SEEN_GAME_KEY) ?? null;
    if (stored !== null && !isGame(stored)) {
      store?.removeItem?.(LAST_SEEN_GAME_KEY);
      stored = null;
    }
    const { pulse, store: next } = lastSeenDecision(stored, latest);
    if (next !== null) store?.setItem(LAST_SEEN_GAME_KEY, next);
    return pulse;
  } catch {
    return false; // storage blocked: never pulse
  }
}
