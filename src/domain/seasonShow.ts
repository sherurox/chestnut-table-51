import type { Data, ID } from "./types.js";
import { seasonGames, seasonStandings } from "./standings.js";

// "Season show": the podium on a season's page and the trophy cabinet on a player's page.
// Both use the same places as seasonCloseBadges: standings order (net, games played, name), players with
// 1+ finished season-mode game only. Incognito and deleted games never count.

export interface PodiumPlace {
  place: 1 | 2 | 3;
  playerId: ID;
  name: string;
  initials: string;
  net: number;
}

export interface SeasonPodium {
  final: boolean; // the season is closed
  places: PodiumPlace[]; // 1 to 3, best first
}

// "Shreyas Khandale" → "SK", "Rohan" → "R": the first letters of the first and last words.
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = (word: string | undefined) => (word ? (Array.from(word)[0] ?? "") : "");
  const letters = words.length > 1 ? first(words[0]) + first(words[words.length - 1]) : first(words[0]);
  return letters.toUpperCase();
}

// The top 3 of the season's standings among players with 1+ game, or null if nobody has played.
export function seasonPodium(data: Data, seasonId: ID): SeasonPodium | null {
  const season = data.seasons.find((s) => s.id === seasonId);
  if (!season) return null;
  const rows = seasonStandings(data, seasonId).filter((r) => r.gamesPlayed > 0);
  if (rows.length === 0) return null;
  return {
    final: season.status === "closed",
    places: rows.slice(0, 3).map((r, i) => ({
      place: (i + 1) as 1 | 2 | 3,
      playerId: r.playerId,
      name: r.name,
      initials: initials(r.name),
      net: r.net,
    })),
  };
}

export type TrophyKind = "gold" | "silver" | "bronze" | "spoon";

export interface Trophy {
  seasonId: ID;
  seasonName: string;
  kind: TrophyKind;
  net: number;
}

const MEDALS: readonly TrophyKind[] = ["gold", "silver", "bronze"];

// One trophy per Champion/Podium/Wooden spoon badge seasonCloseBadges gives: a medal for a top-3 place,
// plus a spoon for last place (2+ players), so in a 2- or 3-player season last place holds both.
// Newest season first (by its end date, as the badges are dated); within a season the medal comes first.
export function playerTrophies(data: Data, playerId: ID): Trophy[] {
  const closed = data.seasons
    .filter((s) => s.status === "closed")
    .map((season) => ({ season, games: seasonGames(data, season.id) }))
    .filter(({ games }) => games.length > 0)
    .map(({ season, games }) => ({ season, date: season.endedOn ?? games.reduce((max, g) => (g.date > max ? g.date : max), "") }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.season.startedOn.localeCompare(a.season.startedOn));

  const trophies: Trophy[] = [];
  for (const { season } of closed) {
    const rows = seasonStandings(data, season.id).filter((r) => r.gamesPlayed > 0);
    const place = rows.findIndex((r) => r.playerId === playerId);
    if (place < 0) continue;
    const add = (kind: TrophyKind) => trophies.push({ seasonId: season.id, seasonName: season.name, kind, net: rows[place]!.net });
    if (place < 3) add(MEDALS[place]!);
    if (rows.length >= 2 && place === rows.length - 1) add("spoon");
  }
  return trophies;
}
