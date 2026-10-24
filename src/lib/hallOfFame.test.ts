import { describe, expect, it } from "vitest";
import { QUOTES } from "../domain/quotes.js";
import type { Data, Game } from "../domain/types.js";
import { AWARDS, BADGES, SITUATION_NAMES, TIER_NAMES } from "./funLabels.js";
import { hallOfFame, phraseText } from "./hallOfFame.js";

const names: Record<string, string> = { a: "Alice", b: "Bob", c: "Carol" };

function duel(id: string, seasonId: string, date: string, winner: string, loser: string, amount: number, extra: Partial<Game> = {}): Game {
  return {
    id,
    seasonId,
    date,
    mode: "season",
    status: "finished",
    players: [winner, loser],
    buyIns: [{ player: winner, amount: 1000, at: "t" }, { player: loser, amount: 1000, at: "t" }],
    cashOuts: [{ player: winner, amount: 1000 + amount }, { player: loser, amount: 1000 - amount }],
    createdAt: `${date}T20:00:00.000Z`,
    ...extra,
  };
}

function data(games: Game[]): Data {
  return {
    version: 1,
    settings: { presetBuyIns: [1000] },
    players: ["a", "b", "c"].map((id) => ({ id, name: names[id]!, type: "regular", status: "active", createdAt: "2026-01-01T00:00:00.000Z" })),
    seasons: [
      { id: "s1", name: "Season 1", status: "closed", startedOn: "2026-01-01", endedOn: "2026-01-31" },
      { id: "s2", name: "Season 2", status: "active", startedOn: "2026-02-01" },
    ],
    games,
    liveGame: null,
  };
}

const d = data([
  duel("g1", "s1", "2026-01-02", "a", "b", 500),
  duel("g2", "s1", "2026-01-03", "a", "b", 500),
  duel("g3", "s2", "2026-02-02", "b", "c", 200),
  duel("g4", "s2", "2026-02-03", "b", "c", 200),
  duel("g5", "s2", "2026-02-04", "b", "c", 200),
  duel("x1", "s2", "2026-02-05", "c", "b", 999, { mode: "incognito" }),
]);
const hall = hallOfFame(d);

describe("hallOfFame", () => {
  it("shows every tier, situation, badge and award defined in funLabels, in their order", () => {
    expect(hall.titles.map((t) => t.tier).sort()).toEqual(Object.keys(TIER_NAMES).sort());
    expect(hall.situations.map((s) => s.situation).sort()).toEqual(Object.keys(SITUATION_NAMES).sort());
    expect(hall.badges.map((b) => b.kind)).toEqual(BADGES.map((b) => b.kind));
    expect(hall.awards.map((a) => a.kind)).toEqual(AWARDS.map((a) => a.kind));
    for (const t of hall.titles) expect(t.name).toBe(TIER_NAMES[t.tier]);
  });

  it("shows every phrase pool with all its lines", () => {
    expect(hall.phrases.map((p) => p.pool).sort()).toEqual(Object.keys(QUOTES).sort());
    for (const p of hall.phrases) expect(p.lines).toEqual(QUOTES[p.pool]);
  });

  it("titles and situations hold the active season's players", () => {
    expect(hall.season?.id).toBe("s2");
    expect(hall.titles.find((t) => t.tier === "bond")?.holders.map((h) => h.name)).toEqual(["Bob"]); // +200/game on a $1,000 typical
    expect(hall.titles.find((t) => t.tier === "freshBlood")?.holders.map((h) => h.name)).toEqual(["Alice"]); // 0 games in Season 2
    expect(hall.situations.find((s) => s.situation === "heater")?.holders.map((h) => h.name)).toEqual(["Bob"]);
    expect(hall.situations.find((s) => s.situation === "coldStreak")?.holders.map((h) => h.name)).toEqual(["Carol"]);
  });

  it("badge holders with first date and count; unearned badges have none", () => {
    expect(hall.badges.find((b) => b.kind === "champion")?.holders).toEqual([{ playerId: "a", name: "Alice", date: "2026-01-31", count: 1 }]);
    expect(hall.badges.find((b) => b.kind === "woodenSpoon")?.holders.map((h) => h.name)).toEqual(["Bob"]);
    expect(hall.badges.find((b) => b.kind === "firstBlood")?.holders.map((h) => `${h.name} ${h.date}`)).toEqual(["Alice 2026-01-02", "Bob 2026-02-02"]);
    expect(hall.badges.find((b) => b.kind === "whale")?.holders).toEqual([]);
  });

  it("awards: the active season so far and the last closed season's final", () => {
    expect(hall.lastClosed?.id).toBe("s1");
    expect(hall.awards.find((a) => a.kind === "ironMan")?.lastClosed).toBeNull(); // Alice and Bob tie on 2: nobody
    expect(hall.awards.find((a) => a.kind === "bigNight")?.lastClosed).toMatchObject({ playerIds: ["a"], value: 500, final: true });
    expect(hall.awards.find((a) => a.kind === "shark")?.current).toMatchObject({ playerIds: ["b"], final: false });
  });

  it("season champions: closed seasons only, with the champion's net", () => {
    expect(hall.champions.map((c) => `${c.season.name}: ${c.name} ${c.net}`)).toEqual(["Season 1: Alice 1000"]);
  });

  it("works with no seasons at all", () => {
    const empty = hallOfFame({ ...d, seasons: [], games: [] });
    expect(empty.season).toBeNull();
    expect(empty.champions).toEqual([]);
    expect(empty.titles.every((t) => t.holders.length === 0)).toBe(true);
  });

  it("phrase placeholders read as words", () => {
    expect(phraseText("Bank of {name}: {n} wins, {r} rebuys")).toBe("Bank of [player]: [N] wins, [N] rebuys");
  });
});
