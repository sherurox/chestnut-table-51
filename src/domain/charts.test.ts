import { describe, expect, it } from "vitest";
import { bestAndWorstGames, netWinningsOverTime } from "./charts.js";
import type { Data, Game } from "./types.js";

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: overrides.id ?? "g1",
    seasonId: overrides.seasonId ?? "s1",
    date: overrides.date ?? "2026-10-19",
    mode: overrides.mode ?? "season",
    status: overrides.status ?? "finished",
    players: overrides.players ?? ["p1", "p2"],
    buyIns: overrides.buyIns ?? [],
    cashOuts: overrides.cashOuts ?? [],
    createdAt: overrides.createdAt ?? "2026-10-19T00:00:00.000Z",
    ...overrides,
  };
}

function seasonGame(id: string, date: string, players: string[], buyIn: number, cashOuts: number[]): Game {
  return makeGame({
    id,
    date,
    mode: "season",
    players,
    buyIns: players.map((p) => ({ player: p, amount: buyIn, at: "t" })),
    cashOuts: players.map((p, i) => ({ player: p, amount: cashOuts[i] ?? 0 })),
  });
}

function makeData(games: Game[]): Data {
  return {
    version: 1,
    settings: { presetBuyIns: [1000, 1500, 2000] },
    players: [],
    seasons: [{ id: "s1", name: "Season 1", status: "active", startedOn: "2026-01-01" }],
    games,
    liveGame: null,
  };
}

describe("netWinningsOverTime", () => {
  it("accumulates results in date order", () => {
    const data = makeData([
      seasonGame("g1", "2026-10-01", ["p1", "p2"], 1000, [1500, 500]),
      seasonGame("g2", "2026-10-08", ["p1", "p2"], 1000, [700, 1300]),
    ]);
    const points = netWinningsOverTime(data, "s1", "p1");
    expect(points).toEqual([
      { gameId: "g1", date: "2026-10-01", result: 500, net: 500 },
      { gameId: "g2", date: "2026-10-08", result: -300, net: 200 },
    ]);
  });

  it("excludes incognito and other-season games", () => {
    const data = makeData([
      seasonGame("g1", "2026-10-01", ["p1", "p2"], 1000, [1500, 500]),
      makeGame({
        id: "g2",
        mode: "incognito",
        date: "2026-10-05",
        players: ["p1", "p2"],
        buyIns: [{ player: "p1", amount: 1000, at: "t" }, { player: "p2", amount: 1000, at: "t" }],
        cashOuts: [{ player: "p1", amount: 0 }, { player: "p2", amount: 2000 }],
      }),
    ]);
    const points = netWinningsOverTime(data, "s1", "p1");
    expect(points).toEqual([{ gameId: "g1", date: "2026-10-01", result: 500, net: 500 }]);
  });

  it("returns an empty series for a player with no games", () => {
    const data = makeData([]);
    expect(netWinningsOverTime(data, "s1", "p1")).toEqual([]);
  });
});

describe("bestAndWorstGames", () => {
  it("picks the highest and lowest single-game results", () => {
    const data = makeData([
      seasonGame("g1", "2026-10-01", ["p1", "p2"], 1000, [1800, 200]),
      seasonGame("g2", "2026-10-08", ["p1", "p2"], 1000, [600, 1400]),
      seasonGame("g3", "2026-10-15", ["p1", "p2"], 1000, [1000, 1000]),
    ]);
    const { best, worst } = bestAndWorstGames(data, "s1", "p1");
    expect(best).toEqual({ gameId: "g1", date: "2026-10-01", result: 800 });
    expect(worst).toEqual({ gameId: "g2", date: "2026-10-08", result: -400 });
  });

  it("returns nulls for a player with no games", () => {
    const data = makeData([]);
    expect(bestAndWorstGames(data, "s1", "p1")).toEqual({ best: null, worst: null });
  });
});
