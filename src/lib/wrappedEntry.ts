import { seasonStandings, type StandingsRow } from "../domain/standings.js";
import type { Data, ID, Season } from "../domain/types.js";

// Who has a Season Wrapped, for the entry buttons on the season and player pages. Kept apart from
// wrapped.ts so the entry bundle doesn't carry the story's model (that ships in the lazy Wrapped chunk).

export function closedSeason(data: Data, seasonId: ID): Season | undefined {
  return data.seasons.find((s) => s.id === seasonId && s.status === "closed");
}

export function playedRows(data: Data, seasonId: ID): StandingsRow[] {
  return seasonStandings(data, seasonId).filter((r) => r.gamesPlayed > 0);
}

// The players who have a Wrapped for this season (closed, 1+ game), in final standings order.
export function wrappedPlayers(data: Data, seasonId: ID): StandingsRow[] {
  return closedSeason(data, seasonId) ? playedRows(data, seasonId) : [];
}

// The closed seasons a player has a Wrapped for, newest first (by end date, then start date).
export function wrappedSeasons(data: Data, playerId: ID): Season[] {
  return data.seasons
    .filter((s) => s.status === "closed" && wrappedPlayers(data, s.id).some((r) => r.playerId === playerId))
    .sort((a, b) => (b.endedOn ?? "").localeCompare(a.endedOn ?? "") || b.startedOn.localeCompare(a.startedOn));
}
