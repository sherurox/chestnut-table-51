import { badgesInGame, nemesis, playerMoods, playerSeasonStats, seasonCloseBadges, seasonGamesInOrder, type BadgeKind } from "../domain/fun.js";
import { playerTrophies, type Trophy } from "../domain/seasonShow.js";
import { seasonStandings, type StandingsRow } from "../domain/standings.js";
import type { Data, ID, Season } from "../domain/types.js";
import { BADGES, badgeTitle, SITUATION_NAMES, TIER_NAMES } from "./funLabels.js";
import { seasonRace } from "./seasonShow.js";

// "Season Wrapped": a closed season's story for one player, slide by slide. Every number comes from an
// existing helper (fun.ts, seasonShow, standings); nothing here re-derives a result. A slide with nothing
// true to say is left out. Inside Wrapped every ×N counts within this season only.

export interface WrappedBadge {
  kind: BadgeKind;
  name: string; // BADGES name
  count: number; // times earned in this season (up to that night, on the best-night slide)
  label: string; // badgeTitle: "Whale ×2"
}

export type WrappedSlide =
  | { kind: "intro"; heading: string; name: string; seasonName: string; games: number; players: number; startedOn: string; endedOn: string }
  | { kind: "finish"; place: number; of: number; placeLabel: string; net: number; trophies: Trophy[] }
  | { kind: "bestNight"; heading: string; gameId: ID; date: string; result: number; badges: WrappedBadge[] }
  | { kind: "top"; ledAfter: number; seasonGames: number; bestRank: number; firstReachedGame: number; line: string }
  | { kind: "toughNight"; gameId: ID; date: string; result: number; totalRebuys: number }
  | { kind: "nemesis"; playerId: ID; name: string; games: number; won: number }
  | { kind: "badges"; badges: WrappedBadge[]; title: string | null }
  | { kind: "finale"; name: string; seasonName: string; place: number; of: number; placeLabel: string; net: number; bestNight: { date: string; result: number }; highlight: string };

export type WrappedSlideKind = WrappedSlide["kind"];

export interface WrappedModel {
  seasonId: ID;
  playerId: ID;
  slides: WrappedSlide[];
}

// The finale's headline badge, best first. Wooden spoon, Felted and Even Steven never headline: with
// none of these the finale shows the title instead.
export const TOP_BADGE_ORDER: readonly BadgeKind[] = [
  "champion", "wireToWire", "perfectAttendance", "podium",
  "manOfTheMatch", "doubleDigits", "luckySeven", "tripleThreat", "whale", "giantSlayer", "loneWolf",
  "phoenix", "hatTrick", "doubleUp", "bounceBack", "secondWind", "halfCentury", "tenClub", "firstBlood",
];

// 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd".
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

function closedSeason(data: Data, seasonId: ID): Season | undefined {
  return data.seasons.find((s) => s.id === seasonId && s.status === "closed");
}

function playedRows(data: Data, seasonId: ID): StandingsRow[] {
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

function badge(kind: BadgeKind, count: number): WrappedBadge {
  const name = BADGES.find((b) => b.kind === kind)?.name ?? kind;
  return { kind, name, count, label: badgeTitle(name, count) };
}

// The player's per-game badge hits in this season's games, in game order (badgesInGame, this player only).
function seasonBadgeHits(data: Data, seasonId: ID, playerId: ID): { gameId: ID; kind: BadgeKind }[] {
  return seasonGamesInOrder(data, seasonId).flatMap((game) =>
    badgesInGame(data, game.id)
      .filter((b) => b.playerId === playerId)
      .map((b) => ({ gameId: game.id, kind: b.kind })),
  );
}

// Times each kind was earned in this season, in the order first earned.
function countKinds(kinds: BadgeKind[]): WrappedBadge[] {
  const counts = new Map<BadgeKind, number>();
  for (const kind of kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  return [...counts].map(([kind, count]) => badge(kind, count));
}

export function wrappedModel(data: Data, seasonId: ID, playerId: ID): WrappedModel | null {
  const season = closedSeason(data, seasonId);
  if (!season) return null;
  const rows = playedRows(data, seasonId);
  const place = rows.findIndex((r) => r.playerId === playerId) + 1;
  const row = rows[place - 1];
  if (!row) return null;

  const stats = playerSeasonStats(data, seasonId, playerId);
  const best = stats.bestNight!;
  const worst = stats.worstNight!;
  const placeLabel = `${ordinal(place)} of ${rows.length}`;
  const slides: WrappedSlide[] = [];

  slides.push({
    kind: "intro",
    heading: `${row.name}, your ${season.name} wrapped.`,
    name: row.name,
    seasonName: season.name,
    games: stats.games,
    players: rows.length,
    startedOn: season.startedOn,
    endedOn: season.endedOn ?? season.startedOn,
  });

  slides.push({
    kind: "finish",
    place,
    of: rows.length,
    placeLabel,
    net: row.net,
    trophies: playerTrophies(data, playerId).filter((t) => t.seasonId === seasonId),
  });

  // Counted within this season up to and including that night.
  const hits = seasonBadgeHits(data, seasonId, playerId);
  const upToBest = hits.slice(0, hits.map((h) => h.gameId).lastIndexOf(best.gameId) + 1);
  const bestBadges = countKinds(upToBest.map((h) => h.kind)).filter((b) => hits.some((h) => h.gameId === best.gameId && h.kind === b.kind));
  slides.push({
    kind: "bestNight",
    heading: best.result < 0 ? "Your least bad night" : "Your best night",
    gameId: best.gameId,
    date: best.date,
    result: best.result,
    badges: bestBadges,
  });

  const frames = seasonRace(data, seasonId);
  const ledAfter = frames.filter((f) => f.rows[0]?.playerId === playerId).length;
  const ranks = frames.flatMap((f) => f.rows.filter((r) => r.playerId === playerId).map((r) => ({ rank: r.rank, game: f.gameNumber })));
  const bestRank = Math.min(...ranks.map((r) => r.rank));
  const firstReachedGame = ranks.find((r) => r.rank === bestRank)!.game;
  slides.push({
    kind: "top",
    ledAfter,
    seasonGames: frames.length,
    bestRank,
    firstReachedGame,
    line:
      ledAfter > 0
        ? `You led after ${ledAfter} of ${frames.length} games`
        : `Highest you climbed: #${bestRank} after game ${firstReachedGame}`,
  });

  if (worst.result < 0) {
    slides.push({ kind: "toughNight", gameId: worst.gameId, date: worst.date, result: worst.result, totalRebuys: stats.totalRebuys });
  }

  const foe = nemesis(data, seasonId, playerId);
  if (foe) slides.push({ kind: "nemesis", ...foe });

  const closeKinds = seasonCloseBadges(data, playerId)
    .filter((b) => b.seasonId === seasonId)
    .map((b) => b.kind);
  const seasonBadges = countKinds([...hits.map((h) => h.kind), ...closeKinds]);
  const mood = playerMoods(data, seasonId).find((m) => m.playerId === playerId);
  const title = mood ? (mood.situation ? SITUATION_NAMES[mood.situation] : TIER_NAMES[mood.tier]) : null;
  if (seasonBadges.length > 0 || title) slides.push({ kind: "badges", badges: seasonBadges, title });

  const top = TOP_BADGE_ORDER.map((kind) => seasonBadges.find((b) => b.kind === kind)).find((b) => b !== undefined);
  slides.push({
    kind: "finale",
    name: row.name,
    seasonName: season.name,
    place,
    of: rows.length,
    placeLabel,
    net: row.net,
    bestNight: { date: best.date, result: best.result },
    highlight: top?.label ?? title ?? "",
  });

  return { seasonId, playerId, slides };
}
