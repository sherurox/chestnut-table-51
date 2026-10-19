import type { Data, ID } from "./types.js";
import { gameResult } from "./results.js";

export interface NetWinningsPoint {
  gameId: ID;
  date: string;
  result: number;
  net: number;
}

function playerSeasonGames(data: Data, seasonId: ID, playerId: ID) {
  return data.games
    .filter(
      (g) =>
        g.seasonId === seasonId &&
        g.mode === "season" &&
        g.status === "finished" &&
        g.players.includes(playerId),
    )
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

export function netWinningsOverTime(data: Data, seasonId: ID, playerId: ID): NetWinningsPoint[] {
  let running = 0;
  return playerSeasonGames(data, seasonId, playerId).map((g) => {
    const result = gameResult(g, playerId);
    running += result;
    return { gameId: g.id, date: g.date, result, net: running };
  });
}

export interface GameResultPoint {
  gameId: ID;
  date: string;
  result: number;
}

export interface BestWorstGames {
  best: GameResultPoint | null;
  worst: GameResultPoint | null;
}

export function bestAndWorstGames(data: Data, seasonId: ID, playerId: ID): BestWorstGames {
  const points = playerSeasonGames(data, seasonId, playerId).map((g) => ({
    gameId: g.id,
    date: g.date,
    result: gameResult(g, playerId),
  }));

  if (points.length === 0) {
    return { best: null, worst: null };
  }

  let best = points[0]!;
  let worst = points[0]!;
  for (const point of points) {
    if (point.result > best.result) best = point;
    if (point.result < worst.result) worst = point;
  }
  return { best, worst };
}
