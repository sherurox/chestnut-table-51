import { describe, expect, it } from "vitest";
import { champion, seasonStandings } from "./standings.js";
import type { Data, Game, Player, Season } from "./types.js";

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: overrides.id ?? "p1",
    name: overrides.name ?? "Player",
    type: overrides.type ?? "regular",
    status: overrides.status ?? "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeSeason(overrides: Partial<Season> = {}): Season {
  return {
    id: "s1",
    name: "Season 1",
    status: "active",
    startedOn: "2026-01-01",
    ...overrides,
  };
}

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: overrides.id ?? "g1",
    seasonId: overrides.seasonId ?? "s1",
    date: "2026-10-19",
    mode: overrides.mode ?? "season",
    status: overrides.status ?? "finished",
    players: overrides.players ?? [],
    buyIns: overrides.buyIns ?? [],
    cashOuts: overrides.cashOuts ?? [],
    createdAt: "2026-10-19T00:00:00.000Z",
    ...overrides,
  };
}

function makeData(overrides: Partial<Data> = {}): Data {
  return {
    version: 1,
    settings: { presetBuyIns: [1000, 1500, 2000] },
    players: [],
    seasons: [makeSeason()],
    games: [],
    liveGame: null,
    ...overrides,
  };
}

function seasonGame(id: string, players: string[], buyIn: number, cashOuts: number[], seasonId = "s1"): Game {
  return makeGame({
    id,
    seasonId,
    mode: "season",
    players,
    buyIns: players.map((p) => ({ player: p, amount: buyIn, at: "t" })),
    cashOuts: players.map((p, i) => ({ player: p, amount: cashOuts[i] ?? 0 })),
  });
}

describe("seasonStandings", () => {
  it("excludes games from other seasons", () => {
    const data = makeData({
      players: [makePlayer({ id: "p1", name: "Alice" }), makePlayer({ id: "p2", name: "Bob" })],
      seasons: [makeSeason({ id: "s1" }), makeSeason({ id: "s2", status: "closed" })],
      games: [
        seasonGame("g1", ["p1", "p2"], 1000, [1500, 500], "s1"),
        seasonGame("g2", ["p1", "p2"], 1000, [0, 2000], "s2"),
      ],
    });
    const rows = seasonStandings(data, "s1");
    const alice = rows.find((r) => r.playerId === "p1")!;
    expect(alice.net).toBe(500);
    expect(alice.gamesPlayed).toBe(1);
  });

  it("excludes incognito games", () => {
    const data = makeData({
      players: [makePlayer({ id: "p1", name: "Alice" }), makePlayer({ id: "p2", name: "Bob" })],
      games: [
        seasonGame("g1", ["p1", "p2"], 1000, [1500, 500]),
        makeGame({
          id: "g2",
          mode: "incognito",
          players: ["p1", "p2"],
          buyIns: [{ player: "p1", amount: 1000, at: "t" }, { player: "p2", amount: 1000, at: "t" }],
          cashOuts: [{ player: "p1", amount: 0 }, { player: "p2", amount: 2000 }],
        }),
      ],
    });
    const rows = seasonStandings(data, "s1");
    const alice = rows.find((r) => r.playerId === "p1")!;
    expect(alice.net).toBe(500);
    expect(alice.gamesPlayed).toBe(1);
  });

  it("excludes deleted games", () => {
    const data = makeData({
      players: [makePlayer({ id: "p1", name: "Alice" }), makePlayer({ id: "p2", name: "Bob" })],
      games: [
        seasonGame("g1", ["p1", "p2"], 1000, [1500, 500]),
        { ...seasonGame("g2", ["p1", "p2"], 1000, [0, 2000]), status: "deleted" as const },
      ],
    });
    const rows = seasonStandings(data, "s1");
    const alice = rows.find((r) => r.playerId === "p1")!;
    expect(alice.net).toBe(500);
    expect(alice.gamesPlayed).toBe(1);
  });

  it("leaves absent players unaffected", () => {
    const data = makeData({
      players: [
        makePlayer({ id: "p1", name: "Alice" }),
        makePlayer({ id: "p2", name: "Bob" }),
        makePlayer({ id: "p3", name: "Carol" }),
      ],
      games: [seasonGame("g1", ["p1", "p2"], 1000, [1500, 500])],
    });
    const rows = seasonStandings(data, "s1");
    const carol = rows.find((r) => r.playerId === "p3")!;
    expect(carol.net).toBe(0);
    expect(carol.gamesPlayed).toBe(0);
  });

  it("ranks negative totals below positive ones", () => {
    const data = makeData({
      players: [makePlayer({ id: "p1", name: "Alice" }), makePlayer({ id: "p2", name: "Bob" })],
      games: [seasonGame("g1", ["p1", "p2"], 1000, [1800, 200])],
    });
    const [first, second] = seasonStandings(data, "s1");
    expect(first?.playerId).toBe("p1");
    expect(first?.net).toBe(800);
    expect(second?.playerId).toBe("p2");
    expect(second?.net).toBe(-800);
  });

  it("breaks ties by games played, then name A->Z", () => {
    const data = makeData({
      players: [
        makePlayer({ id: "p1", name: "Zed" }),
        makePlayer({ id: "p2", name: "Alice" }),
        makePlayer({ id: "p3", name: "Bob" }),
      ],
      games: [
        seasonGame("g1", ["p1", "p2", "p3"], 1000, [1000, 1000, 1000]),
        seasonGame("g2", ["p1", "p3"], 1000, [1000, 1000]),
      ],
    });
    const rows = seasonStandings(data, "s1");
    // p1 (Zed) and p3 (Bob) are tied on net ($0) and games played (2); name A->Z puts Bob before Zed.
    expect(rows.map((r) => r.playerId)).toEqual(["p3", "p1", "p2"]);
  });

  it("counts only season-mode games played after a guest is promoted mid-season", () => {
    const data = makeData({
      players: [
        makePlayer({ id: "p1", name: "Alice" }),
        makePlayer({ id: "p2", name: "Guestie", type: "regular" }),
      ],
      games: [
        makeGame({
          id: "g1",
          mode: "incognito",
          players: ["p1", "p2"],
          buyIns: [{ player: "p1", amount: 1000, at: "t" }, { player: "p2", amount: 1000, at: "t" }],
          cashOuts: [{ player: "p1", amount: 500 }, { player: "p2", amount: 1500 }],
        }),
        seasonGame("g2", ["p1", "p2"], 1000, [1200, 800]),
      ],
    });
    const rows = seasonStandings(data, "s1");
    const guestie = rows.find((r) => r.playerId === "p2")!;
    expect(guestie.gamesPlayed).toBe(1);
    expect(guestie.net).toBe(-200);
  });

  it("includes active regular players with 0 games at $0", () => {
    const data = makeData({
      players: [makePlayer({ id: "p1", name: "Alice" })],
      games: [],
    });
    const rows = seasonStandings(data, "s1");
    expect(rows).toEqual([{ playerId: "p1", name: "Alice", net: 0, gamesPlayed: 0 }]);
  });

  it("includes an archived player who has season games", () => {
    const data = makeData({
      players: [makePlayer({ id: "p1", name: "Alice", status: "archived" }), makePlayer({ id: "p2", name: "Bob" })],
      games: [seasonGame("g1", ["p1", "p2"], 1000, [1500, 500])],
    });
    const rows = seasonStandings(data, "s1");
    expect(rows.some((r) => r.playerId === "p1")).toBe(true);
  });

  it("excludes an archived player with 0 games", () => {
    const data = makeData({
      players: [makePlayer({ id: "p1", name: "Alice", status: "archived" }), makePlayer({ id: "p2", name: "Bob" })],
      games: [],
    });
    const rows = seasonStandings(data, "s1");
    expect(rows.some((r) => r.playerId === "p1")).toBe(false);
  });
});

describe("champion", () => {
  it("returns null for a season with no games", () => {
    const data = makeData({ players: [makePlayer({ id: "p1", name: "Alice" })], games: [] });
    expect(champion(data, "s1")).toBeNull();
  });

  it("changes when a finished game in a closed season is edited", () => {
    const before = makeData({
      seasons: [makeSeason({ status: "closed", endedOn: "2026-10-01" })],
      players: [makePlayer({ id: "p1", name: "Alice" }), makePlayer({ id: "p2", name: "Bob" })],
      games: [seasonGame("g1", ["p1", "p2"], 1000, [1800, 200])],
    });
    expect(champion(before, "s1")).toBe("p1");

    const after: Data = {
      ...before,
      games: [
        { ...seasonGame("g1", ["p1", "p2"], 1000, [200, 1800]), editedAt: "2026-10-05T00:00:00.000Z" },
      ],
    };
    expect(champion(after, "s1")).toBe("p2");
  });
});

describe("zero-sum invariant", () => {
  function seededRandom(seed: number) {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
  }

  it("keeps season net winnings summing to zero across random valid games", () => {
    const seed = 42;
    const rand = seededRandom(seed);

    const playerIds = ["p1", "p2", "p3", "p4", "p5"];
    const players = playerIds.map((id) => makePlayer({ id, name: `Player-${id}` }));

    const games: Game[] = [];
    for (let i = 0; i < 200; i++) {
      const playerCount = 2 + Math.floor(rand() * (playerIds.length - 1));
      const gamePlayers = playerIds.slice(0, playerCount);
      const buyIns = gamePlayers.map((p) => ({
        player: p,
        amount: 500 + Math.floor(rand() * 10) * 100,
        at: "t",
      }));
      const totalIn = buyIns.reduce((sum, b) => sum + b.amount, 0);

      const shares = gamePlayers.map(() => rand());
      const shareSum = shares.reduce((sum, s) => sum + s, 0);
      const cashOuts = gamePlayers.map((p, idx) => ({
        player: p,
        amount: Math.round(((shares[idx] ?? 0) / shareSum) * totalIn),
      }));
      const roundedTotal = cashOuts.reduce((sum, c) => sum + c.amount, 0);
      const [firstCashOut] = cashOuts;
      if (firstCashOut) firstCashOut.amount += totalIn - roundedTotal;

      games.push(
        makeGame({
          id: `g${i}`,
          mode: "season",
          players: gamePlayers,
          buyIns,
          cashOuts,
        }),
      );
    }

    const data = makeData({ players, games });
    const rows = seasonStandings(data, "s1");
    const total = rows.reduce((sum, r) => sum + r.net, 0);

    if (total !== 0) {
      throw new Error(`Zero-sum invariant failed with seed ${seed}: total net was ${total}`);
    }
    expect(total).toBe(0);
  });
});
