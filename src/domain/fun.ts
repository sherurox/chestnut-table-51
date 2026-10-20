import type { Data, Game, ID } from "./types.js";
import { finalStack, gameResult, totalBuyIns } from "./results.js";
import { seasonStandings } from "./standings.js";
import { QUOTES } from "./quotes.js";

// "Home & fun" stats: tiers, situations, daily lines, nemesis, badges, awards, season summary.
// Everything here counts finished season-mode games only. Incognito and deleted games never count
// (the season summary reports the incognito count and nothing else).

const DAY_MS = 86_400_000;
const DEFAULT_BUY_IN = 1000;

export type Tier = "legend" | "bond" | "biscuit" | "easyTiger" | "atm" | "freshBlood";
export type Situation = "heater" | "comeback" | "coldStreak" | "rebuyKing" | "backAfterBreak";
export type QuotePool = Tier | Situation;
export type FormMark = "W" | "L" | "E";

// ---- helpers --------------------------------------------------------------------------------------

// Oldest first: by game date, then by when it was saved.
function oldestFirst(a: Game, b: Game): number {
  return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

function countedGames(data: Data): Game[] {
  return data.games.filter((g) => g.mode === "season" && g.status === "finished").sort(oldestFirst);
}

function seasonGames(data: Data, seasonId: ID): Game[] {
  return countedGames(data).filter((g) => g.seasonId === seasonId);
}

// A player's first buy-in is their starting stack, so rebuys = buy-ins − 1.
function rebuys(game: Game, playerId: ID): number {
  return Math.max(0, game.buyIns.filter((b) => b.player === playerId).length - 1);
}

function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function nameOf(data: Data, playerId: ID): string {
  return data.players.find((p) => p.id === playerId)?.name ?? playerId;
}

// ---- typical buy-in -------------------------------------------------------------------------------

// The most common first buy-in across the season's games (ties → the higher amount). 1000 if none.
export function typicalBuyIn(data: Data, seasonId: ID): number {
  const counts = new Map<number, number>();
  for (const game of seasonGames(data, seasonId)) {
    for (const playerId of game.players) {
      const first = game.buyIns.find((b) => b.player === playerId);
      if (first) counts.set(first.amount, (counts.get(first.amount) ?? 0) + 1);
    }
  }
  let best = DEFAULT_BUY_IN;
  let bestCount = 0;
  for (const [amount, count] of counts) {
    if (count > bestCount || (count === bestCount && amount > best)) {
      best = amount;
      bestCount = count;
    }
  }
  return best;
}

// ---- player season stats --------------------------------------------------------------------------

export interface NightRecord {
  gameId: ID;
  date: string;
  result: number;
  rebuys: number;
}

export interface Streak {
  kind: "win" | "loss";
  length: number;
}

export interface PlayerSeasonStats {
  playerId: ID;
  games: number;
  net: number;
  avgPerGame: number;
  winRate: number; // 0–1, result > 0
  bestNight: NightRecord | null;
  worstNight: NightRecord | null;
  form: FormMark[]; // last 5 results, oldest first
  streak: Streak | null; // current run of wins or losses; a $0 night breaks it
  totalRebuys: number;
  rebuysPerGame: number;
  lastPlayed: string | null;
  nights: NightRecord[]; // every season game, oldest first
}

function mark(result: number): FormMark {
  return result > 0 ? "W" : result < 0 ? "L" : "E";
}

function currentStreak(nights: NightRecord[]): Streak | null {
  const last = nights[nights.length - 1];
  if (!last || last.result === 0) return null;
  const kind = last.result > 0 ? "win" : "loss";
  let length = 0;
  for (let i = nights.length - 1; i >= 0; i--) {
    const r = nights[i]!.result;
    if ((kind === "win" && r > 0) || (kind === "loss" && r < 0)) length++;
    else break;
  }
  return { kind, length };
}

function nightsOf(games: Game[], playerId: ID): NightRecord[] {
  return games
    .filter((g) => g.players.includes(playerId))
    .map((g) => ({ gameId: g.id, date: g.date, result: gameResult(g, playerId), rebuys: rebuys(g, playerId) }));
}

function statsFromNights(playerId: ID, nights: NightRecord[]): PlayerSeasonStats {
  const games = nights.length;
  const net = nights.reduce((s, n) => s + n.result, 0);
  const totalRebuys = nights.reduce((s, n) => s + n.rebuys, 0);
  let best: NightRecord | null = null;
  let worst: NightRecord | null = null;
  for (const n of nights) {
    if (!best || n.result > best.result) best = n;
    if (!worst || n.result < worst.result) worst = n;
  }
  return {
    playerId,
    games,
    net,
    avgPerGame: games ? net / games : 0,
    winRate: games ? nights.filter((n) => n.result > 0).length / games : 0,
    bestNight: best,
    worstNight: worst,
    form: nights.slice(-5).map((n) => mark(n.result)),
    streak: currentStreak(nights),
    totalRebuys,
    rebuysPerGame: games ? totalRebuys / games : 0,
    lastPlayed: nights[nights.length - 1]?.date ?? null,
    nights,
  };
}

export function playerSeasonStats(data: Data, seasonId: ID, playerId: ID): PlayerSeasonStats {
  return statsFromNights(playerId, nightsOf(seasonGames(data, seasonId), playerId));
}

// ---- tier -----------------------------------------------------------------------------------------

// ratio = avgPerGame / typicalBuyIn, compared in whole numbers so the boundaries are exact.
export function tier(stats: Pick<PlayerSeasonStats, "games" | "net">, typical: number): Tier {
  if (stats.games < 3) return "freshBlood";
  const lhs = 10 * stats.net; // 10 × net vs k × typical × games, for ratio thresholds k/10
  const at = (k: number) => k * typical * stats.games;
  if (lhs >= at(5)) return "legend";
  if (lhs >= at(2)) return "bond";
  if (lhs > at(-2)) return "biscuit";
  if (lhs > at(-5)) return "easyTiger";
  return "atm";
}

// ---- situation ------------------------------------------------------------------------------------

function isComeback(n: NightRecord): boolean {
  return n.rebuys >= 2 && n.result > 0;
}

// Highest rebuys per game in the season (3+ games, at least 1.0). Ties share it.
function rebuyKings(all: PlayerSeasonStats[]): ID[] {
  const eligible = all.filter((s) => s.games >= 3);
  const top = Math.max(0, ...eligible.map((s) => s.rebuysPerGame));
  if (top < 1) return [];
  return eligible.filter((s) => s.rebuysPerGame === top).map((s) => s.playerId);
}

function allSeasonStats(data: Data, seasonId: ID): PlayerSeasonStats[] {
  const games = seasonGames(data, seasonId);
  const ids = new Set(games.flatMap((g) => g.players));
  return [...ids].map((id) => statsFromNights(id, nightsOf(games, id)));
}

function situationOf(stats: PlayerSeasonStats, kings: ID[], seasonLatestDate: string | null): Situation | null {
  const { streak, nights } = stats;
  const latest = nights[nights.length - 1];
  const previous = nights[nights.length - 2];
  if (streak?.kind === "win" && streak.length >= 3) return "heater";
  if (latest && isComeback(latest)) return "comeback";
  if (streak?.kind === "loss" && streak.length >= 3) return "coldStreak";
  if (kings.includes(stats.playerId)) return "rebuyKing";
  if (
    latest &&
    previous &&
    latest.date === seasonLatestDate &&
    dayNumber(latest.date) - dayNumber(previous.date) >= 14
  ) {
    return "backAfterBreak";
  }
  return null;
}

// First that applies wins: heater → comeback → coldStreak → rebuyKing → backAfterBreak.
export function situation(data: Data, seasonId: ID, playerId: ID): Situation | null {
  const all = allSeasonStats(data, seasonId);
  const stats = all.find((s) => s.playerId === playerId);
  if (!stats) return null;
  const games = seasonGames(data, seasonId);
  return situationOf(stats, rebuyKings(all), games[games.length - 1]?.date ?? null);
}

// ---- player moods (tier + situation for the leaderboard) -----------------------------------------

export interface PlayerMood {
  playerId: ID;
  name: string;
  stats: PlayerSeasonStats;
  tier: Tier;
  situation: Situation | null;
}

// Every leaderboard row, in standings order (ranked), with its tier and situation.
export function playerMoods(data: Data, seasonId: ID): PlayerMood[] {
  const games = seasonGames(data, seasonId);
  const typical = typicalBuyIn(data, seasonId);
  const kings = rebuyKings(allSeasonStats(data, seasonId));
  const latestDate = games[games.length - 1]?.date ?? null;
  return seasonStandings(data, seasonId).map((row) => {
    const stats = statsFromNights(row.playerId, nightsOf(games, row.playerId));
    return {
      playerId: row.playerId,
      name: row.name,
      stats,
      tier: tier(stats, typical),
      situation: situationOf(stats, kings, latestDate),
    };
  });
}

// ---- daily quotes ---------------------------------------------------------------------------------

// FNV-1a, 32-bit.
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(size: number, seed: number): number[] {
  const order = Array.from({ length: size }, (_, i) => i);
  const rand = seededRandom(seed);
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

// A player's line order for one cycle through the pool. Each cycle is a fresh shuffle, so every line
// comes up once per cycle; a cycle never starts with the line the previous one ended on.
function cycleOrder(key: string, size: number, cycle: number): number[] {
  const order = shuffled(size, hash(`${key}|${cycle}`));
  if (size > 1) {
    const prev = shuffled(size, hash(`${key}|${cycle - 1}`));
    if (order[0] === prev[size - 1]) [order[0], order[1]] = [order[1]!, order[0]!];
  }
  return order;
}

export interface AssignedQuote {
  playerId: ID;
  pool: QuotePool;
  line: string;
}

function fill(template: string, mood: PlayerMood): string {
  const latest = mood.stats.nights[mood.stats.nights.length - 1];
  const r =
    mood.situation === "rebuyKing"
      ? String(Math.round(mood.stats.rebuysPerGame * 10) / 10)
      : String(latest?.rebuys ?? 0);
  return template
    .replaceAll("{name}", mood.name)
    .replaceAll("{n}", String(mood.stats.streak?.length ?? 0))
    .replaceAll("{r}", r);
}

export function quotePool(mood: Pick<PlayerMood, "tier" | "situation">): QuotePool {
  return mood.situation ?? mood.tier;
}

// Today's line for each player. Deterministic for a given day and season; each player's line changes
// from one day to the next. Players are served in rank order and no two share a line on the same day
// unless their pool runs out, in which case the pool starts over.
// `date` is YYYYMMDD (dashes are ignored, so YYYY-MM-DD works too).
export function assignQuotes(
  players: PlayerMood[],
  date: string,
  seasonId: ID,
  quotes: Record<QuotePool, readonly string[]> = QUOTES,
): AssignedQuote[] {
  const digits = date.replaceAll("-", "");
  const day = dayNumber(`${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`);
  const used = new Map<QuotePool, Set<number>>();

  return players.map((mood) => {
    const pool = quotePool(mood);
    const lines = quotes[pool];
    const size = lines.length;
    let taken = used.get(pool);
    if (!taken || taken.size >= size) {
      taken = new Set();
      used.set(pool, taken);
    }
    const order = cycleOrder(`${seasonId}|${mood.playerId}|${pool}`, size, Math.floor(day / size));
    const start = ((day % size) + size) % size;
    let pick = order[start]!;
    for (let i = 0; i < size; i++) {
      const candidate = order[(start + i) % size]!;
      if (!taken.has(candidate)) {
        pick = candidate;
        break;
      }
    }
    taken.add(pick);
    return { playerId: mood.playerId, pool, line: fill(lines[pick]!, mood) };
  });
}

// ---- nemesis --------------------------------------------------------------------------------------

export interface Nemesis {
  playerId: ID;
  name: string;
  games: number; // season games where P finished down and this player finished up
  won: number; // what they won in those games
}

// The opponent who most often finished up when P finished down (3+ such games).
// Ties → more won in those games, then name A→Z.
export function nemesis(data: Data, seasonId: ID, playerId: ID): Nemesis | null {
  const tally = new Map<ID, { games: number; won: number }>();
  for (const game of seasonGames(data, seasonId)) {
    if (!game.players.includes(playerId) || gameResult(game, playerId) >= 0) continue;
    for (const other of game.players) {
      if (other === playerId) continue;
      const result = gameResult(game, other);
      if (result <= 0) continue;
      const t = tally.get(other) ?? { games: 0, won: 0 };
      tally.set(other, { games: t.games + 1, won: t.won + result });
    }
  }
  const candidates = [...tally]
    .filter(([, t]) => t.games >= 3)
    .map(([id, t]) => ({ playerId: id, name: nameOf(data, id), ...t }))
    .sort((a, b) => b.games - a.games || b.won - a.won || a.name.localeCompare(b.name));
  return candidates[0] ?? null;
}

// ---- badges (all-time, season games only) ---------------------------------------------------------

export type BadgeKind = "firstBlood" | "hatTrick" | "doubleUp" | "phoenix" | "tenClub" | "halfCentury";

export interface Badge {
  kind: BadgeKind;
  gameId: ID;
  date: string;
}

// Each badge is earned once, in the game where it first happened. Listed in the order earned.
export function badges(data: Data, playerId: ID): Badge[] {
  const earned = new Map<BadgeKind, Badge>();
  const earn = (kind: BadgeKind, game: Game) => {
    if (!earned.has(kind)) earned.set(kind, { kind, gameId: game.id, date: game.date });
  };
  let played = 0;
  let wins = 0;
  for (const game of countedGames(data)) {
    if (!game.players.includes(playerId)) continue;
    played++;
    const result = gameResult(game, playerId);
    const bought = totalBuyIns(game, playerId);
    wins = result > 0 ? wins + 1 : 0;
    if (result > 0) earn("firstBlood", game);
    if (wins >= 3) earn("hatTrick", game);
    if (bought > 0 && finalStack(game, playerId) >= 2 * bought) earn("doubleUp", game);
    if (rebuys(game, playerId) >= 3 && result > 0) earn("phoenix", game);
    if (played === 10) earn("tenClub", game);
    if (played === 50) earn("halfCentury", game);
  }
  return [...earned.values()];
}

// ---- season awards --------------------------------------------------------------------------------

export type AwardKind = "shark" | "atm" | "rock" | "comebackKid" | "bigNight" | "rollercoaster" | "ironMan";

export interface Award {
  kind: AwardKind;
  playerIds: ID[]; // ties share, sorted by name
  value: number;
  final: boolean; // the season is closed
}

const RATE_MIN_GAMES = 3;

function stdDev(values: number[]): number {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

// Live during the season, final once it's closed. Ties share, but if every qualifying player ties
// (two or more), nobody gets it. Rate-based awards (shark, rock, rollercoaster) need 3+ games; rock also
// needs at least one qualifying player to have rebought. Count awards need a value above 0.
// null = nobody gets it.
export function seasonAwards(data: Data, seasonId: ID): Record<AwardKind, Award | null> {
  const final = data.seasons.find((s) => s.id === seasonId)?.status === "closed";
  const all = allSeasonStats(data, seasonId);
  const rated = all.filter((s) => s.games >= RATE_MIN_GAMES);
  const byName = (ids: ID[]) => ids.sort((a, b) => nameOf(data, a).localeCompare(nameOf(data, b)));

  const award = (
    kind: AwardKind,
    pool: PlayerSeasonStats[],
    score: (s: PlayerSeasonStats) => number,
    best: "max" | "min",
    mustBePositive: boolean,
  ): Award | null => {
    if (pool.length === 0) return null;
    const scores = pool.map((s) => ({ id: s.playerId, v: score(s) }));
    const top = best === "max" ? Math.max(...scores.map((s) => s.v)) : Math.min(...scores.map((s) => s.v));
    if (mustBePositive && !(top > 0)) return null;
    const ids = scores.filter((s) => Math.abs(s.v - top) < 1e-9).map((s) => s.id);
    if (pool.length > 1 && ids.length === pool.length) return null;
    return { kind, playerIds: byName(ids), value: top, final };
  };

  return {
    shark: award("shark", rated, (s) => s.avgPerGame, "max", false),
    atm: award("atm", all, (s) => s.totalRebuys, "max", true),
    rock: rated.some((s) => s.totalRebuys > 0) ? award("rock", rated, (s) => s.rebuysPerGame, "min", false) : null,
    comebackKid: award("comebackKid", all, (s) => s.nights.filter(isComeback).length, "max", true),
    bigNight: award("bigNight", all, (s) => s.bestNight?.result ?? 0, "max", true),
    rollercoaster: award("rollercoaster", rated, (s) => stdDev(s.nights.map((n) => n.result)), "max", true),
    ironMan: award("ironMan", all, (s) => s.games, "max", true),
  };
}

// ---- season summary -------------------------------------------------------------------------------

export interface SeasonSummary {
  name: string;
  startedOn: string;
  daysRunning: number; // calendar days, start day = 1; a closed season stops at endedOn
  gamesPlayed: number;
  totalBuyIns: number;
  leader: { playerId: ID; name: string; net: number } | null;
  biggestNight: { playerId: ID; name: string; amount: number; date: string; gameId: ID } | null;
  rebuyKings: ID[];
  longestWinStreak: { playerIds: ID[]; length: number } | null; // current (active) streaks only
  incognitoGames: number; // shown as a count only, never mixed into stats
}

// `today` is the phone's local date, YYYY-MM-DD. null if the season doesn't exist.
export function seasonSummary(data: Data, seasonId: ID, today: string): SeasonSummary | null {
  const season = data.seasons.find((s) => s.id === seasonId);
  if (!season) return null;
  const games = seasonGames(data, seasonId);
  const all = allSeasonStats(data, seasonId);

  const end = season.status === "closed" && season.endedOn ? season.endedOn : today;
  const daysRunning = Math.max(0, dayNumber(end) - dayNumber(season.startedOn) + 1);

  const [top] = seasonStandings(data, seasonId);
  const leader = games.length > 0 && top ? { playerId: top.playerId, name: top.name, net: top.net } : null;

  // Biggest single-game result; ties → the earlier game, then name A→Z.
  let biggestNight: SeasonSummary["biggestNight"] = null;
  for (const game of games) {
    for (const playerId of [...game.players].sort((a, b) => nameOf(data, a).localeCompare(nameOf(data, b)))) {
      const amount = gameResult(game, playerId);
      if (amount > 0 && (!biggestNight || amount > biggestNight.amount)) {
        biggestNight = { playerId, name: nameOf(data, playerId), amount, date: game.date, gameId: game.id };
      }
    }
  }

  const winStreaks = all.filter((s) => s.streak?.kind === "win");
  const longest = Math.max(0, ...winStreaks.map((s) => s.streak!.length));
  const longestWinStreak =
    longest > 0
      ? {
          playerIds: winStreaks
            .filter((s) => s.streak!.length === longest)
            .map((s) => s.playerId)
            .sort((a, b) => nameOf(data, a).localeCompare(nameOf(data, b))),
          length: longest,
        }
      : null;

  return {
    name: season.name,
    startedOn: season.startedOn,
    daysRunning,
    gamesPlayed: games.length,
    totalBuyIns: games.reduce((sum, g) => sum + g.buyIns.reduce((s, b) => s + b.amount, 0), 0),
    leader,
    biggestNight,
    rebuyKings: rebuyKings(all),
    longestWinStreak,
    incognitoGames: data.games.filter(
      (g) => g.seasonId === seasonId && g.mode === "incognito" && g.status === "finished",
    ).length,
  };
}
