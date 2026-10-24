import { MAX_SEASON_GAMES } from "../config.js";
import { seasonGames } from "./standings.js";
import type { Data, ID, Season } from "./types.js";

// The 10-game season limit (CLAUDE.md §5.2, Table tools step D). Only finished season-mode games count;
// incognito and deleted games never do. Finishing the game that reaches the limit closes the season in
// the same commit (finishGameChange); an edit or restore that reaches it doesn't, and the season then
// waits for the admin to end it.

export function seasonGameCount(data: Data, seasonId: ID): number {
  return seasonGames(data, seasonId).length;
}

export function seasonIsFull(data: Data, seasonId: ID): boolean {
  return seasonGameCount(data, seasonId) >= MAX_SEASON_GAMES;
}

// An active season that is already full (it reached the limit by an edit or restore, or before the
// limit existed): no more season games until the admin ends it.
export function seasonFullMessage(season: Season): string {
  return `${season.name} is complete: end it to crown the champion`;
}

// The season's end date when finishing a game fills it: the latest date among its counted games, so a
// backdated last game never leaves a later game outside the season's dates.
export function seasonEndDate(data: Data, seasonId: ID): string {
  return seasonGames(data, seasonId).reduce((max, g) => (g.date > max ? g.date : max), "");
}

// true when this change closed the season by filling it (used for the "; Season 1 complete" message).
export function seasonCompletedBy(before: Data, after: Data, seasonId: ID): boolean {
  const was = before.seasons.find((s) => s.id === seasonId);
  const now = after.seasons.find((s) => s.id === seasonId);
  return was?.status === "active" && now?.status === "closed";
}
