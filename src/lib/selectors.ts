import { assignQuotes, playerMoods, type PlayerMood } from "../domain/fun.js";
import { localIsoDate } from "../domain/dates.js";
import type { Data, Game, ID, Player, Season } from "../domain/types.js";

export function activeSeason(data: Data): Season | undefined {
  return data.seasons.find((s) => s.status === "active");
}

export function allSeasonsNewestFirst(data: Data): Season[] {
  return data.seasons.slice().sort((a, b) => b.startedOn.localeCompare(a.startedOn));
}

export function seasonById(data: Data, id: ID): Season | undefined {
  return data.seasons.find((s) => s.id === id);
}

export function playerById(data: Data, id: ID): Player | undefined {
  return data.players.find((p) => p.id === id);
}

export function gameById(data: Data, id: ID): Game | undefined {
  return data.games.find((g) => g.id === id);
}

export function visibleGames(data: Data, seasonId?: ID): Game[] {
  return data.games
    .filter((g) => g.status === "finished" && (seasonId ? g.seasonId === seasonId : true))
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export function activePlayersSortedByName(data: Data): Player[] {
  return data.players
    .filter((p) => p.status === "active")
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface TodaysLine {
  mood: PlayerMood;
  line: string;
}

// Each leaderboard player's tier/situation and today's line (the phone's local date). Computed for the
// whole season at once so the leaderboard and the player page show the same, non-repeating lines.
export function todaysLines(data: Data, seasonId: ID, today: string = localIsoDate()): Map<ID, TodaysLine> {
  const moods = playerMoods(data, seasonId);
  const quotes = assignQuotes(moods, today, seasonId);
  return new Map(moods.map((mood, i) => [mood.playerId, { mood, line: quotes[i]!.line }]));
}
