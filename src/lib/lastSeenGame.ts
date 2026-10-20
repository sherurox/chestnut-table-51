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
export function checkLastSeenGame(latest: ID | null, store: Pick<Storage, "getItem" | "setItem"> | null): boolean {
  try {
    const { pulse, store: next } = lastSeenDecision(store?.getItem(LAST_SEEN_GAME_KEY) ?? null, latest);
    if (next !== null) store?.setItem(LAST_SEEN_GAME_KEY, next);
    return pulse;
  } catch {
    return false; // storage blocked: never pulse
  }
}
