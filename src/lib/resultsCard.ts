import { MAX_SEASON_GAMES } from "../config.js";
import { badgesInGame, seasonGamesInOrder } from "../domain/fun.js";
import { nightSummary } from "../domain/highlights.js";
import { winnerLine } from "../domain/quotes.js";
import { gameResult } from "../domain/results.js";
import { seasonStandings } from "../domain/standings.js";
import type { Data, Game } from "../domain/types.js";
import { formatSignedDollars } from "./format.js";
import { BADGES, badgeTitle } from "./funLabels.js";
import { shareDate } from "./share.js";

export interface CardRow {
  name: string;
  result: number;
  resultText: string;
}

// Everything the results card shows, as plain text (drawResultsCard.ts only lays it out).
export interface ResultsCardModel {
  title: string;
  date: string;
  // Season games: the season's name and "GAME 8 OF 10" ("GAME 11" past the limit). Incognito: a label only.
  label: { kind: "season"; seasonName: string; gameText: string } | { kind: "incognito"; text: string };
  // The night's biggest winner (ties share it); null when nobody finished up.
  manOfTheMatch: { names: string[]; name: string; result: number; resultText: string; line: string } | null;
  others: CardRow[];
  badges: string[]; // "Rohan: Whale ×2"
  // "Season leader: …" as of this game, or "Season 1 champion: …" on a closed season's last game.
  standingLine: { kind: "leader" | "champion"; text: string } | null;
  footer: string;
}

const row = (name: string, result: number): CardRow => ({ name, result, resultText: formatSignedDollars(result) });

// `data` must already include the game.
export function resultsCardModel(data: Data, game: Game): ResultsCardModel {
  const nameOf = (id: string) => data.players.find((p) => p.id === id)?.name ?? "?";
  const season = data.seasons.find((s) => s.id === game.seasonId);
  const isSeason = game.mode === "season";

  const { winners } = nightSummary(data, game);
  const winnerIds = new Set(winners.map((w) => w.playerId));
  const manOfTheMatch =
    winners.length > 0
      ? {
          names: winners.map((w) => w.name),
          name: winners.map((w) => w.name).join(" & "),
          result: winners[0]!.result,
          resultText: formatSignedDollars(winners[0]!.result),
          line: winnerLine(game.id),
        }
      : null;

  // Sorted like shareText: best result first, then name.
  const others = game.players
    .filter((id) => !winnerIds.has(id))
    .map((id) => row(nameOf(id), gameResult(game, id)))
    .sort((a, b) => b.result - a.result || a.name.localeCompare(b.name));

  const base = { title: "CHESTNUT TABLE 51", date: shareDate(game.date), manOfTheMatch, others, footer: "Paisa he paisa hoga" };
  if (!isSeason) {
    return { ...base, label: { kind: "incognito", text: "INCOGNITO" }, badges: [], standingLine: null };
  }

  const ordered = seasonGamesInOrder(data, game.seasonId);
  const index = ordered.findIndex((g) => g.id === game.id);
  const n = index + 1;
  const gameText = n > MAX_SEASON_GAMES ? `GAME ${n}` : `GAME ${n} OF ${MAX_SEASON_GAMES}`;

  const names = new Map(BADGES.map((b) => [b.kind, b.name]));
  const badges = badgesInGame(data, game.id).map((b) => `${nameOf(b.playerId)}: ${badgeTitle(names.get(b.kind) ?? b.kind, b.count)}`);

  // Standings as of this game: only this season's games up to and including it.
  const asOf = seasonStandings({ ...data, games: ordered.slice(0, index + 1) }, game.seasonId)[0];
  const closing = season?.status === "closed" && index === ordered.length - 1;
  const standingLine = asOf
    ? closing
      ? { kind: "champion" as const, text: `${season.name} champion: ${asOf.name} ${formatSignedDollars(asOf.net)}` }
      : { kind: "leader" as const, text: `Season leader: ${asOf.name} ${formatSignedDollars(asOf.net)}` }
    : null;

  return {
    ...base,
    label: { kind: "season", seasonName: season?.name ?? "Season", gameText },
    badges,
    standingLine,
  };
}
