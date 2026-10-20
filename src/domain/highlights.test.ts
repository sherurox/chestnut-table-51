import { describe, expect, it } from "vitest";
import { latestFinishedGame, nightSummary, otherSeasonName, rankChanges, relativeNight } from "./highlights.js";
import type { Data, Game, Player } from "./types.js";

function player(id: string, name: string, overrides: Partial<Player> = {}): Player {
  return { id, name, type: "regular", status: "active", createdAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

// results[i] is player i's result for a game where everyone bought in once for $1,000.
function game(id: string, date: string, results: Record<string, number>, overrides: Partial<Game> = {}): Game {
  const players = Object.keys(results);
  return {
    id,
    seasonId: "s1",
    date,
    mode: "season",
    status: "finished",
    players,
    buyIns: players.map((p) => ({ player: p, amount: 1000, at: "t" })),
    cashOuts: players.map((p) => ({ player: p, amount: 1000 + results[p]! })),
    createdAt: `${date}T22:00:00.000Z`,
    ...overrides,
  };
}

function data(games: Game[], players: Player[] = []): Data {
  return {
    version: 1,
    settings: { presetBuyIns: [1000, 1500, 2000] },
    players: players.length
      ? players
      : [player("a", "Amit"), player("b", "Bea"), player("c", "Cal"), player("d", "Dev")],
    seasons: [{ id: "s1", name: "Season 1", status: "active", startedOn: "2026-10-01" }],
    games,
    liveGame: null,
  };
}

describe("latestFinishedGame", () => {
  it("picks the newest by date, then createdAt, in any mode, ignoring deleted games", () => {
    const g1 = game("g1", "2026-10-10", { a: 100, b: -100 });
    const g2 = game("g2", "2026-10-12", { a: 100, b: -100 }, { mode: "incognito", createdAt: "2026-10-12T20:00:00.000Z" });
    const g3 = game("g3", "2026-10-12", { a: 100, b: -100 }, { createdAt: "2026-10-12T19:00:00.000Z" });
    const g4 = game("g4", "2026-10-14", { a: 100, b: -100 }, { status: "deleted" });
    expect(latestFinishedGame(data([g1, g3, g2, g4]))?.id).toBe("g2");
  });

  it("is null with no finished games", () => {
    expect(latestFinishedGame(data([]))).toBeNull();
    expect(latestFinishedGame(data([game("g", "2026-10-10", { a: 0, b: 0 }, { status: "deleted" })]))).toBeNull();
  });
});

describe("nightSummary", () => {
  it("names the winner and the biggest loser with their rebuys", () => {
    const g: Game = {
      ...game("g", "2026-10-18", {}),
      players: ["a", "b", "d"],
      buyIns: [
        { player: "a", amount: 1000, at: "t" },
        { player: "b", amount: 1000, at: "t" },
        { player: "d", amount: 1000, at: "t" },
        { player: "d", amount: 1000, at: "t" },
        { player: "d", amount: 500, at: "t" },
        { player: "d", amount: 500, at: "t" },
      ],
      cashOuts: [
        { player: "a", amount: 3900 },
        { player: "b", amount: 100 },
        { player: "d", amount: 2000 },
      ],
    };
    const s = nightSummary(data([g]), g);
    expect(s.playerCount).toBe(3);
    expect(s.winners.map((w) => [w.name, w.result])).toEqual([["Amit", 2900]]);
    expect(s.roughNight).toMatchObject({ name: "Dev", result: -1000, rebuys: 3 });
  });

  it("shares the crown between everyone tied for the top", () => {
    const g = game("g", "2026-10-18", { c: 500, a: 500, b: -1000 });
    const s = nightSummary(data([g]), g);
    expect(s.winners.map((w) => w.name)).toEqual(["Amit", "Cal"]);
    expect(s.roughNight?.name).toBe("Bea");
  });

  it("breaks a tie for worst by more rebuys, then name", () => {
    const g = game("g", "2026-10-18", { a: 1000, c: -500, b: -500 });
    expect(nightSummary(data([g]), g).roughNight?.name).toBe("Bea");
    const rebought: Game = { ...g, buyIns: [...g.buyIns, { player: "c", amount: 1000, at: "t" }], cashOuts: g.cashOuts.map((c) => (c.player === "c" ? { ...c, amount: 1500 } : c)) };
    expect(nightSummary(data([rebought]), rebought).roughNight).toMatchObject({ name: "Cal", rebuys: 1, result: -500 });
  });

  it("has no winner or loser when everyone broke even", () => {
    const g = game("g", "2026-10-18", { a: 0, b: 0 });
    const s = nightSummary(data([g]), g);
    expect(s.winners).toEqual([]);
    expect(s.roughNight).toBeNull();
  });
});

describe("relativeNight", () => {
  const today = new Date(2026, 9, 19, 9, 30);
  it("labels today and yesterday by local calendar date", () => {
    expect(relativeNight("2026-10-19", today)).toBe("Tonight");
    expect(relativeNight("2026-10-18", today)).toBe("Last night");
    expect(relativeNight("2026-10-17", today)).toBeNull();
    expect(relativeNight("2026-10-20", today)).toBeNull();
  });
  it("crosses month boundaries", () => {
    expect(relativeNight("2026-09-30", new Date(2026, 9, 1, 0, 5))).toBe("Last night");
  });
});

describe("rankChanges", () => {
  const abc = [player("a", "Amit"), player("b", "Bea"), player("c", "Cal")];
  const ab = [player("a", "Amit"), player("b", "Bea")];

  it("shows no arrows for the first game of the season", () => {
    expect(rankChanges(data([game("g1", "2026-10-10", { a: 500, b: -500 })]), "s1").size).toBe(0);
    expect(rankChanges(data([]), "s1").size).toBe(0);
  });

  it("compares standings before and after the latest season game", () => {
    const g1 = game("g1", "2026-10-10", { a: 500, b: 200, c: -700 });
    const g2 = game("g2", "2026-10-11", { c: 1000, a: -1000 });
    // Before: Amit +500, Bea +200, Cal −700. After: Cal +300, Bea +200, Amit −500.
    const changes = rankChanges(data([g1, g2], abc), "s1");
    expect(changes.get("c")).toEqual({ kind: "up", by: 2 });
    expect(changes.get("a")).toEqual({ kind: "down", by: 2 });
    expect(changes.has("b")).toBe(false); // unchanged
  });

  it("moves a player who sat out the last game when someone passes them", () => {
    const g1 = game("g1", "2026-10-10", { a: 300, b: 100, c: -100, d: -300 });
    const g2 = game("g2", "2026-10-11", { c: 300, d: -300 });
    // Before: Amit +300, Bea +100, Cal −100, Dev −300. After: Amit +300, Cal +200, Bea +100, Dev −600.
    const changes = rankChanges(data([g1, g2]), "s1");
    expect(changes.get("b")).toEqual({ kind: "down", by: 1 });
    expect(changes.get("c")).toEqual({ kind: "up", by: 1 });
    expect(changes.has("a")).toBe(false);
    expect(changes.has("d")).toBe(false);
  });

  it("marks a first-time player NEW even though they were listed at $0 before", () => {
    const g1 = game("g1", "2026-10-10", { a: 300, b: -300 });
    const g2 = game("g2", "2026-10-11", { d: 200, a: -200 });
    // Before: Amit +300, Cal $0 (0 games), Dev $0 (0 games), Bea −300.
    // After: Dev +200, Amit +100, Cal $0 (0 games), Bea −300.
    const changes = rankChanges(data([g1, g2]), "s1");
    expect(changes.get("d")).toEqual({ kind: "new" });
    expect(changes.get("a")).toEqual({ kind: "down", by: 1 });
    expect(changes.has("b")).toBe(false);
    expect(changes.has("c")).toBe(false); // 0 games: never an arrow
  });

  it("uses the tiebreaks (games played, then name) for ranks", () => {
    // Before: Amit +100 (1), Cal $0 (0), Bea −100 (1). After: Bea +100 (2) beats Amit +100 (1) on games.
    const g1 = game("g1", "2026-10-10", { a: 100, b: -100 });
    const g2 = game("g2", "2026-10-11", { b: 200, c: -200 });
    const byGames = rankChanges(data([g1, g2], abc), "s1");
    expect(byGames.get("b")).toEqual({ kind: "up", by: 2 });
    expect(byGames.get("a")).toEqual({ kind: "down", by: 1 });
    expect(byGames.get("c")).toEqual({ kind: "new" });

    // Before: Bea +100, Amit −100. After: both $0 with 2 games, so the name decides: Amit, Bea.
    const h1 = game("h1", "2026-10-10", { b: 100, a: -100 });
    const h2 = game("h2", "2026-10-11", { a: 100, b: -100 });
    const byName = rankChanges(data([h1, h2], ab), "s1");
    expect(byName.get("a")).toEqual({ kind: "up", by: 1 });
    expect(byName.get("b")).toEqual({ kind: "down", by: 1 });
  });

  it("ignores incognito and deleted games and other seasons", () => {
    const g1 = game("g1", "2026-10-10", { a: 500, b: -500 });
    const inc = game("i1", "2026-10-12", { b: 5000, a: -5000 }, { mode: "incognito" });
    const del = game("x1", "2026-10-13", { b: 5000, a: -5000 }, { status: "deleted" });
    const other = game("o1", "2026-10-14", { b: 5000, a: -5000 }, { seasonId: "s0" });
    expect(rankChanges(data([g1, inc, del, other], ab), "s1").size).toBe(0);

    // The latest season game is g2 even though the ignored games are newer.
    const g2 = game("g2", "2026-10-11", { b: 2000, a: -2000 });
    const changes = rankChanges(data([g1, g2, inc, del, other], ab), "s1");
    expect(changes.get("b")).toEqual({ kind: "up", by: 1 });
    expect(changes.get("a")).toEqual({ kind: "down", by: 1 });
  });

  it("orders the latest game by date, then createdAt", () => {
    const byDate = game("g1", "2026-10-11", { b: 2000, a: -2000 }, { createdAt: "2026-10-11T23:00:00.000Z" });
    const savedLater = game("g2", "2026-10-10", { a: 500, b: -500 }, { createdAt: "2026-10-12T23:00:00.000Z" });
    // g1 has the later date, so it is the last game even though g2 was saved later.
    expect(rankChanges(data([byDate, savedLater], ab), "s1").get("b")).toEqual({ kind: "up", by: 1 });

    const first = game("g1", "2026-10-11", { b: 2000, a: -2000 }, { createdAt: "2026-10-11T20:00:00.000Z" });
    const second = game("g2", "2026-10-11", { a: 500, b: -500 }, { createdAt: "2026-10-11T23:00:00.000Z" });
    // Same date: g2 was saved later, so it is the last game. Before: Bea +2000; after: Bea +1500.
    expect(rankChanges(data([first, second], ab), "s1").size).toBe(0);
  });
});

describe("otherSeasonName (Home's last-game card label)", () => {
  const seasons = (s1: "active" | "closed", s2?: "active") => [
    { id: "s1", name: "Season 1", status: s1, startedOn: "2026-10-15", ...(s1 === "closed" ? { endedOn: "2026-10-20" } : {}) },
    ...(s2 ? [{ id: "s2", name: "Season 2", status: s2, startedOn: "2026-10-20" }] : []),
  ];
  const g = game("g1", "2026-10-19", { a: 100, b: -100 });
  const withSeasons = (list: Data["seasons"]): Data => ({ ...data([g]), seasons: list });

  it("is null for a game in the active season", () => {
    expect(otherSeasonName(withSeasons(seasons("active")), g)).toBeNull();
  });

  it("names the season when it isn't the active one: new season started, or none active", () => {
    expect(otherSeasonName(withSeasons(seasons("closed", "active")), g)).toBe("Season 1");
    expect(otherSeasonName(withSeasons(seasons("closed")), g)).toBe("Season 1");
  });
});
