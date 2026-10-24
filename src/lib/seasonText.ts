import { MAX_SEASON_GAMES } from "../config.js";
import { seasonCompletedBy, seasonGameCount } from "../domain/seasonLimit.js";
import { champion, seasonStandings } from "../domain/standings.js";
import type { Data, ID, Season } from "../domain/types.js";
import { formatSignedDollars } from "./format.js";

// Confirm wording for ending a season (Admin → Seasons): names the champion who'll be crowned (the
// current #1, computed, never stored) or says there's none.
export function crownLine(data: Data, season: Season): string {
  const id = champion(data, season.id);
  const top = id ? seasonStandings(data, season.id).find((r) => r.playerId === id) : undefined;
  return top
    ? `${top.name} (${formatSignedDollars(top.net)}) will be crowned ${season.name} champion.`
    : `No season games were played in ${season.name}, so there's no champion.`;
}

export const CANT_UNDO = "This can't be undone from the app.";

// Season progress for the leaderboard header and the stats panel (§5.2): "Game 8 of 10".
export function seasonProgress(data: Data, seasonId: ID): string {
  const count = seasonGameCount(data, seasonId);
  return count === 0 ? `No games yet · ${MAX_SEASON_GAMES} to play` : `Game ${count} of ${MAX_SEASON_GAMES}`;
}

// The end screen's save confirm when this game fills the season: `after` is the data with the game saved,
// so the champion named includes tonight's results. null when saving doesn't close the season.
export function seasonCompleteLine(before: Data, after: Data, seasonId: ID): string | null {
  const season = before.seasons.find((s) => s.id === seasonId);
  if (!season || !seasonCompletedBy(before, after, seasonId)) return null;
  const id = champion(after, seasonId);
  const top = id ? seasonStandings(after, seasonId).find((r) => r.playerId === id) : undefined;
  const count = seasonGameCount(after, seasonId);
  const crowns = top ? ` and crowns ${top.name} (${formatSignedDollars(top.net)})` : "";
  return `This is game ${count} of ${MAX_SEASON_GAMES}. Saving ends ${season.name}${crowns}.`;
}

// Home's button once the last season closed by filling up: straight to a pre-filled "Start new season".
export function seasonCompleteStartText(season: Season, nextName: string): string {
  return `${season.name} is complete: start ${nextName}`;
}
