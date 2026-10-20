import type { Data, Game, ID } from "../domain/types.js";

// Rank arrows pulse and confetti bursts once on Home after a new season game. "New" means created after
// everything this phone has already seen: the newest createdAt seen is kept in localStorage (non-secret,
// display only) as a watermark that only ever moves forward. Game ids and dates aren't used, so editing a
// game's date, deleting the latest game or restoring an old one never makes an old game look new.
export const SEEN_WATERMARK_KEY = "ct51.seenGamesUpTo";
// Before the watermark, the phone stored the last seen game's id. Read once to migrate, then removed.
export const LAST_SEEN_GAME_KEY = "ct51.lastSeenGame";

// The most recently created finished season-mode game in the season (incognito and deleted never count).
export function latestSeasonGame(data: Data, seasonId: ID): Game | null {
  let latest: Game | null = null;
  for (const g of data.games) {
    if (g.seasonId !== seasonId || g.mode !== "season" || g.status !== "finished") continue;
    if (!latest || isLater(g.createdAt, latest.createdAt)) latest = g;
  }
  return latest;
}

// ISO datetimes compared as instants (string order as a fallback for anything unparseable).
export function isLater(a: string, b: string): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return Number.isNaN(ta) || Number.isNaN(tb) ? a > b : ta > tb;
}

// watermark: the newest createdAt this phone has seen (null = first ever visit). latest: the newest
// season game's createdAt now. First visit: no celebration, just remember. Only a game created after the
// watermark celebrates, and moves the watermark up; nothing ever moves it back.
export function newGameDecision(watermark: string | null, latest: string | null): { celebrate: boolean; store: string | null } {
  if (latest === null) return { celebrate: false, store: null };
  if (watermark === null) return { celebrate: false, store: latest };
  return isLater(latest, watermark) ? { celebrate: true, store: latest } : { celebrate: false, store: null };
}

// Reads the watermark (migrating the old last-seen-id key), applies the decision and writes the key.
// createdAtOf: the createdAt of a game id in the data, or null if there is no such game (an id left from
// the wiped test data is simply forgotten, like a first visit). Returns whether to celebrate.
export function checkNewGame(
  latest: Game | null,
  store: (Pick<Storage, "getItem" | "setItem"> & Partial<Pick<Storage, "removeItem">>) | null,
  createdAtOf: (id: ID) => string | null,
): boolean {
  try {
    let watermark = store?.getItem(SEEN_WATERMARK_KEY) ?? null;
    const legacy = store?.getItem(LAST_SEEN_GAME_KEY) ?? null;
    if (legacy !== null) {
      if (watermark === null) {
        watermark = createdAtOf(legacy);
        if (watermark !== null) store?.setItem(SEEN_WATERMARK_KEY, watermark);
      }
      store?.removeItem?.(LAST_SEEN_GAME_KEY);
    }
    const { celebrate, store: next } = newGameDecision(watermark, latest?.createdAt ?? null);
    if (next !== null) store?.setItem(SEEN_WATERMARK_KEY, next);
    return celebrate;
  } catch {
    return false; // storage blocked: never celebrate
  }
}
