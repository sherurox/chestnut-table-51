import type { Data, Game, ID } from "./types.js";
import { gameResult } from "./results.js";
import { seasonStandings } from "./standings.js";

// Newest first: by game date, then by when it was saved.
function newestFirst(a: Game, b: Game): number {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
}

// The most recent finished game in any season and either mode, or null if there are none.
export function latestFinishedGame(data: Data): Game | null {
  const finished = data.games.filter((g) => g.status === "finished").sort(newestFirst);
  return finished[0] ?? null;
}

// The game's season name when it isn't the active season (e.g. a new season with no games yet, or no
// season active after End season), so Home's last-game card says which season it was from. Else null.
export function otherSeasonName(data: Data, game: Game): string | null {
  const season = data.seasons.find((s) => s.id === game.seasonId);
  return season && season.status !== "active" ? season.name : null;
}

export interface NightPlayer {
  playerId: ID;
  name: string;
  result: number;
  rebuys: number;
}

export interface NightSummary {
  game: Game;
  playerCount: number;
  winners: NightPlayer[]; // everyone tied for the top result; empty if nobody finished up
  roughNight: NightPlayer | null; // the biggest loser; null if nobody finished down
}

// The "Last night" card: winners (ties share the crown) and the biggest loser with their rebuy count.
// A player's first buy-in is their starting stack, so rebuys = buy-ins − 1.
export function nightSummary(data: Data, game: Game): NightSummary {
  const names = new Map(data.players.map((p) => [p.id, p.name]));
  const rows: NightPlayer[] = game.players.map((playerId) => ({
    playerId,
    name: names.get(playerId) ?? playerId,
    result: gameResult(game, playerId),
    rebuys: Math.max(0, game.buyIns.filter((b) => b.player === playerId).length - 1),
  }));

  const top = Math.max(...rows.map((r) => r.result));
  const winners = top > 0 ? rows.filter((r) => r.result === top).sort((a, b) => a.name.localeCompare(b.name)) : [];

  // Ties for the worst result: more rebuys is the rougher night, then name A→Z.
  const losers = rows
    .filter((r) => r.result < 0)
    .sort((a, b) => a.result - b.result || b.rebuys - a.rebuys || a.name.localeCompare(b.name));

  return { game, playerCount: game.players.length, winners, roughNight: losers[0] ?? null };
}

// "Tonight" / "Last night" relative to the phone's local date; null for anything older (or in the future).
export function relativeNight(isoDate: string, today: Date = new Date()): "Tonight" | "Last night" | null {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const game = new Date(y, m - 1, d);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((start.getTime() - game.getTime()) / 86_400_000);
  if (days === 0) return "Tonight";
  if (days === 1) return "Last night";
  return null;
}

export type RankChange = { kind: "up"; by: number } | { kind: "down"; by: number } | { kind: "new" };

// Rank movement on the season leaderboard: standings before the most recent finished season game vs now.
// Only players whose rank changed (or who are newly ranked) appear in the map. "Ranked" means at least
// one finished season game; active regulars with 0 games are listed at $0 but carry no arrow.
// Empty until the season has at least 2 finished season games. Incognito and deleted games never count.
export function rankChanges(data: Data, seasonId: ID): Map<ID, RankChange> {
  const changes = new Map<ID, RankChange>();
  const games = data.games
    .filter((g) => g.seasonId === seasonId && g.mode === "season" && g.status === "finished")
    .sort(newestFirst);
  const latest = games[0];
  if (!latest || games.length < 2) return changes;

  const before = seasonStandings({ ...data, games: data.games.filter((g) => g !== latest) }, seasonId);
  const beforeRank = new Map(before.filter((r) => r.gamesPlayed > 0).map((r) => [r.playerId, before.indexOf(r) + 1]));

  seasonStandings(data, seasonId).forEach((row, i) => {
    if (row.gamesPlayed === 0) return;
    const was = beforeRank.get(row.playerId);
    const now = i + 1;
    if (was === undefined) changes.set(row.playerId, { kind: "new" });
    else if (now < was) changes.set(row.playerId, { kind: "up", by: was - now });
    else if (now > was) changes.set(row.playerId, { kind: "down", by: now - was });
  });
  return changes;
}
