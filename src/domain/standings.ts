import type { Data, ID } from "./types.js";
import { gameResult } from "./results.js";

export interface StandingsRow {
  playerId: ID;
  name: string;
  net: number;
  gamesPlayed: number;
}

// The games that count for a season: its finished season-mode games (§5.7).
export function seasonGames(data: Data, seasonId: ID) {
  return data.games.filter(
    (g) => g.seasonId === seasonId && g.mode === "season" && g.status === "finished",
  );
}

export function seasonStandings(data: Data, seasonId: ID): StandingsRow[] {
  const games = seasonGames(data, seasonId);

  const net = new Map<ID, number>();
  const gamesPlayed = new Map<ID, number>();

  for (const game of games) {
    for (const playerId of game.players) {
      net.set(playerId, (net.get(playerId) ?? 0) + gameResult(game, playerId));
      gamesPlayed.set(playerId, (gamesPlayed.get(playerId) ?? 0) + 1);
    }
  }

  const playerIds = new Set<ID>(gamesPlayed.keys());
  for (const player of data.players) {
    if (player.status === "active" && player.type === "regular") {
      playerIds.add(player.id);
    }
  }

  const playersById = new Map(data.players.map((p) => [p.id, p]));

  const rows: StandingsRow[] = [];
  for (const playerId of playerIds) {
    const played = gamesPlayed.get(playerId) ?? 0;
    const player = playersById.get(playerId);
    if (played === 0 && player?.status !== "active") continue;
    rows.push({
      playerId,
      name: player?.name ?? playerId,
      net: net.get(playerId) ?? 0,
      gamesPlayed: played,
    });
  }

  rows.sort((a, b) => {
    if (b.net !== a.net) return b.net - a.net;
    if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
    return a.name.localeCompare(b.name);
  });

  return rows;
}

export function champion(data: Data, seasonId: ID): ID | null {
  if (seasonGames(data, seasonId).length === 0) return null;
  const [top] = seasonStandings(data, seasonId);
  return top ? top.playerId : null;
}
