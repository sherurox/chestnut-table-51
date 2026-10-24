import { allBadges, playerMoods, seasonAwards, typicalBuyIn, type Award, type AwardKind, type BadgeKind, type QuotePool, type Situation, type Tier } from "../domain/fun.js";
import { QUOTES } from "../domain/quotes.js";
import { champion, seasonStandings } from "../domain/standings.js";
import type { Data, ID, Season } from "../domain/types.js";
import { AWARDS, BADGES, SITUATION_NAMES, SITUATION_RULES, TIER_NAMES, TIER_RULES } from "./funLabels.js";
import { activeSeason } from "./selectors.js";

// The Hall of Fame page (#/hall): every title, situation, badge, award and phrase pool, straight from
// domain/fun.ts and funLabels.ts, with who holds each one. Display data only, no rules of its own.

export interface Holder {
  playerId: ID;
  name: string;
}

export interface BadgeHolder extends Holder {
  date: string; // first earned
  count: number;
}

export interface HallOfFame {
  season: Season | null; // the active season
  typicalBuyIn: number | null; // the active season's
  titles: { tier: Tier; name: string; rule: string; holders: Holder[] }[];
  situations: { situation: Situation; name: string; rule: string; holders: Holder[] }[];
  badges: { kind: BadgeKind; name: string; icon: string; howToEarn: string; holders: BadgeHolder[] }[];
  lastClosed: Season | null;
  awards: { kind: AwardKind; name: string; description: string; current: Award | null; lastClosed: Award | null }[];
  phrases: { pool: QuotePool; name: string; lines: readonly string[] }[];
  champions: { season: Season; playerId: ID; name: string; net: number }[]; // closed seasons, newest first
}

const byName = (a: Holder, b: Holder) => a.name.localeCompare(b.name);

// Closed seasons, latest end first.
function closedNewestFirst(data: Data): Season[] {
  return data.seasons
    .filter((s) => s.status === "closed")
    .sort((a, b) => (b.endedOn ?? b.startedOn).localeCompare(a.endedOn ?? a.startedOn) || b.startedOn.localeCompare(a.startedOn));
}

export function hallOfFame(data: Data): HallOfFame {
  const season = activeSeason(data) ?? null;
  const moods = season ? playerMoods(data, season.id) : [];
  const holdersOf = (match: (m: (typeof moods)[number]) => boolean): Holder[] =>
    moods.filter(match).map((m) => ({ playerId: m.playerId, name: m.name })).sort(byName);

  const earned = data.players.map((p) => ({ player: p, badges: allBadges(data, p.id) }));
  const closed = closedNewestFirst(data);
  const lastClosed = closed[0] ?? null;
  const currentAwards = season ? seasonAwards(data, season.id) : null;
  const lastAwards = lastClosed ? seasonAwards(data, lastClosed.id) : null;

  return {
    season,
    typicalBuyIn: season ? typicalBuyIn(data, season.id) : null,
    titles: TIER_RULES.map(({ tier, rule }) => ({ tier, name: TIER_NAMES[tier], rule, holders: holdersOf((m) => m.tier === tier) })),
    situations: SITUATION_RULES.map(({ situation, rule }) => ({
      situation,
      name: SITUATION_NAMES[situation],
      rule,
      holders: holdersOf((m) => m.situation === situation),
    })),
    badges: BADGES.map((b) => ({
      ...b,
      holders: earned
        .flatMap(({ player, badges }) => {
          const badge = badges.find((x) => x.kind === b.kind);
          return badge ? [{ playerId: player.id, name: player.name, date: badge.date, count: badge.count }] : [];
        })
        .sort((x, y) => x.date.localeCompare(y.date) || byName(x, y)),
    })),
    lastClosed,
    awards: AWARDS.map((a) => ({ ...a, current: currentAwards?.[a.kind] ?? null, lastClosed: lastAwards?.[a.kind] ?? null })),
    phrases: [
      ...TIER_RULES.map(({ tier }) => ({ pool: tier as QuotePool, name: TIER_NAMES[tier], lines: QUOTES[tier] })),
      ...SITUATION_RULES.map(({ situation }) => ({ pool: situation as QuotePool, name: SITUATION_NAMES[situation], lines: QUOTES[situation] })),
    ],
    champions: closed.flatMap((s) => {
      const id = champion(data, s.id);
      const row = id ? seasonStandings(data, s.id).find((r) => r.playerId === id) : undefined;
      return row ? [{ season: s, playerId: row.playerId, name: row.name, net: row.net }] : [];
    }),
  };
}

// Phrase templates for reading: placeholders become plain words.
export function phraseText(line: string): string {
  return line.replaceAll("{name}", "[player]").replaceAll("{n}", "[N]").replaceAll("{r}", "[N]");
}
