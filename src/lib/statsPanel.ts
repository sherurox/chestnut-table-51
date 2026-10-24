import { playerSeasonStats, seasonAwards, seasonSummary } from "../domain/fun.js";
import type { Data, ID } from "../domain/types.js";
import { AWARDS, awardValue } from "./funLabels.js";
import { seasonProgress } from "./seasonText.js";
import { activeSeason, todaysLines } from "./selectors.js";

// The header wordmark's season-stats panel (AppShell). Display only: every number comes from
// seasonSummary / seasonAwards / playerSeasonStats as they are.

function namesOf(data: Data, ids: ID[]): string {
  const names = ids.map((id) => data.players.find((p) => p.id === id)?.name ?? "?");
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}` : (names[0] ?? "");
}

export interface BiggestNight {
  playerIds: ID[]; // everyone who hit the amount, A→Z
  names: string; // "Alice & Bob"
  amount: number;
  date: string | null; // the most recent of the tied nights; null when 3+ players share it
}

// seasonSummary's biggest night names one player; the panel lists everyone tied for it, like the Big
// Night award does.
function biggestNightTies(data: Data, seasonId: ID, amount: number): BiggestNight {
  const hits = data.players.flatMap((p) =>
    playerSeasonStats(data, seasonId, p.id)
      .nights.filter((n) => n.result === amount)
      .map((n) => ({ playerId: p.id, name: p.name, date: n.date })),
  );
  const playerIds = [...new Set(hits.map((h) => h.playerId))].sort((a, b) =>
    hits.find((h) => h.playerId === a)!.name.localeCompare(hits.find((h) => h.playerId === b)!.name),
  );
  const latest = hits.map((h) => h.date).sort().at(-1) ?? null;
  return { playerIds, names: namesOf(data, playerIds), amount, date: playerIds.length >= 3 ? null : latest };
}

// A single win isn't a streak: the "Longest win streak" row needs 2+ in a row.
const MIN_WIN_STREAK = 2;

export interface StatsPanelContent {
  seasonName: string;
  day: number;
  progress: string; // "Game 8 of 10"
  gamesPlayed: number;
  totalBuyIns: number;
  leader: { playerId: ID; name: string; net: number; line: string | null } | null;
  biggestNight: BiggestNight | null;
  rebuyKing: { names: string } | null;
  winStreak: { names: string; length: number } | null;
  awards: { kind: string; name: string; holders: string; value: string }[]; // held so far, AWARDS order
  incognitoGames: number;
}

// null = no active season ("No season running yet"). `today` is the phone's local date, YYYY-MM-DD.
export function statsPanelContent(data: Data, today: string): StatsPanelContent | null {
  const season = activeSeason(data);
  const summary = season ? seasonSummary(data, season.id, today) : null;
  if (!season || !summary) return null;
  const awards = seasonAwards(data, season.id);
  const leaderLine = summary.leader ? (todaysLines(data, season.id, today).get(summary.leader.playerId)?.line ?? null) : null;

  return {
    seasonName: summary.name,
    day: summary.daysRunning,
    progress: seasonProgress(data, season.id),
    gamesPlayed: summary.gamesPlayed,
    totalBuyIns: summary.totalBuyIns,
    leader: summary.leader && { ...summary.leader, line: leaderLine },
    biggestNight: summary.biggestNight && biggestNightTies(data, season.id, summary.biggestNight.amount),
    rebuyKing: summary.rebuyKings.length > 0 ? { names: namesOf(data, summary.rebuyKings) } : null,
    winStreak:
      summary.longestWinStreak && summary.longestWinStreak.length >= MIN_WIN_STREAK
        ? { names: namesOf(data, summary.longestWinStreak.playerIds), length: summary.longestWinStreak.length }
        : null,
    awards: AWARDS.flatMap(({ kind, name }) => {
      const award = awards[kind];
      return award ? [{ kind, name, holders: namesOf(data, award.playerIds), value: awardValue(kind, award.value) }] : [];
    }),
    incognitoGames: summary.incognitoGames,
  };
}

export function offTheBooksText(incognitoGames: number): string | null {
  return incognitoGames > 0 ? `+ ${incognitoGames} incognito, off the books` : null;
}
