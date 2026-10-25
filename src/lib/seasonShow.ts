import { seasonGamesInOrder } from "../domain/fun.js";
import { nightSummary } from "../domain/highlights.js";
import { seasonStandings } from "../domain/standings.js";
import type { Data, ID } from "../domain/types.js";
import { formatSignedDollars } from "./format.js";
import { shareDate } from "./share.js";

// The season race replay on a season's page: the standings after each season game, oldest first.

export interface RaceRow {
  playerId: ID;
  name: string;
  net: number; // cumulative, after this game
  rank: number; // 1-based, standings order among players with 1+ game so far
  change: number | "new"; // places gained since the previous frame (negative = dropped); "new" on a first game
}

export interface RaceFrame {
  gameNumber: number; // 1-based, as in seasonGamesInOrder
  gameId: ID;
  date: string; // shareDate, e.g. "Sat 24 Oct"
  rows: RaceRow[]; // rank order
  caption: string;
}

// One frame per finished season-mode game. Each frame is seasonStandings over the games up to it, so the
// last frame is the season's current standings. Players appear from their first game.
export function seasonRace(data: Data, seasonId: ID): RaceFrame[] {
  const games = seasonGamesInOrder(data, seasonId);
  const frames: RaceFrame[] = [];
  let before = new Map<ID, number>();

  games.forEach((game, i) => {
    const standings = seasonStandings({ ...data, games: games.slice(0, i + 1) }, seasonId).filter(
      (r) => r.gamesPlayed > 0,
    );
    const rows: RaceRow[] = standings.map((r, index) => {
      const was = before.get(r.playerId);
      return { playerId: r.playerId, name: r.name, net: r.net, rank: index + 1, change: was === undefined ? "new" : was - (index + 1) };
    });

    const leader = rows[0];
    const previousLeader = frames[i - 1]?.rows[0];
    const { winners } = nightSummary(data, game);
    const caption =
      previousLeader && leader && leader.playerId !== previousLeader.playerId
        ? `${leader.name} takes the lead`
        : winners.length > 0
          ? `${winners.map((w) => w.name).join(" & ")} wins the night ${formatSignedDollars(winners[0]!.result)}`
          : "All square";

    frames.push({ gameNumber: i + 1, gameId: game.id, date: shareDate(game.date), rows, caption });
    before = new Map(rows.map((r) => [r.playerId, r.rank]));
  });
  return frames;
}
