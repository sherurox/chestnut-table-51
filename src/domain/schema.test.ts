import { describe, expect, it } from "vitest";
import { validateData } from "./schema.js";
import type { Data, Game, Player, Season } from "./types.js";

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: "p1",
    name: "Alice",
    type: "regular",
    status: "active",
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
    id: "g1",
    seasonId: "s1",
    date: "2026-10-19",
    mode: "season",
    status: "finished",
    players: ["p1", "p2"],
    buyIns: [
      { player: "p1", amount: 1000, at: "t" },
      { player: "p2", amount: 1000, at: "t" },
    ],
    cashOuts: [
      { player: "p1", amount: 1500 },
      { player: "p2", amount: 500 },
    ],
    createdAt: "2026-10-19T00:00:00.000Z",
    ...overrides,
  };
}

function makeData(overrides: Partial<Data> = {}): Data {
  return {
    version: 1,
    settings: { presetBuyIns: [1000, 1500, 2000] },
    players: [makePlayer({ id: "p1", name: "Alice" }), makePlayer({ id: "p2", name: "Bob" })],
    seasons: [makeSeason()],
    games: [],
    liveGame: null,
    ...overrides,
  };
}

describe("validateData", () => {
  it("accepts a valid minimal data object", () => {
    const data = makeData();
    expect(() => validateData(data)).not.toThrow();
  });

  it("rejects a duplicate player id", () => {
    const data = makeData({
      players: [makePlayer({ id: "p1", name: "Alice" }), makePlayer({ id: "p1", name: "Bob" })],
    });
    expect(() => validateData(data)).toThrow();
  });

  it("rejects duplicate player names, case-insensitively", () => {
    const data = makeData({
      players: [makePlayer({ id: "p1", name: "Alice" }), makePlayer({ id: "p2", name: "ALICE" })],
    });
    expect(() => validateData(data)).toThrow();
  });

  it("rejects duplicate player names after trimming whitespace", () => {
    const data = makeData({
      players: [makePlayer({ id: "p1", name: "Alice" }), makePlayer({ id: "p2", name: "  alice  " })],
    });
    expect(() => validateData(data)).toThrow();
  });

  it("rejects a duplicate season id", () => {
    const data = makeData({
      seasons: [makeSeason({ id: "s1", status: "active" }), makeSeason({ id: "s1", status: "closed" })],
    });
    expect(() => validateData(data)).toThrow();
  });

  it("rejects a duplicate game id", () => {
    const data = makeData({
      games: [makeGame({ id: "g1" }), makeGame({ id: "g1" })],
    });
    expect(() => validateData(data)).toThrow();
  });

  it("rejects a game referencing an unknown season", () => {
    const data = makeData({ games: [makeGame({ seasonId: "nope" })] });
    expect(() => validateData(data)).toThrow();
  });

  it("rejects a game referencing an unknown player", () => {
    const data = makeData({ games: [makeGame({ players: ["p1", "unknown"] })] });
    expect(() => validateData(data)).toThrow();
  });

  it("rejects a buy-in for a player not in the game", () => {
    const data = makeData({
      games: [
        makeGame({
          buyIns: [
            { player: "p1", amount: 1000, at: "t" },
            { player: "p2", amount: 1000, at: "t" },
            { player: "unknown", amount: 500, at: "t" },
          ],
        }),
      ],
    });
    expect(() => validateData(data)).toThrow();
  });

  it("rejects more than one active season", () => {
    const data = makeData({
      seasons: [makeSeason({ id: "s1", status: "active" }), makeSeason({ id: "s2", status: "active" })],
    });
    expect(() => validateData(data)).toThrow();
  });

  it("rejects a finished game with fewer than 2 players", () => {
    const data = makeData({
      games: [
        makeGame({
          players: ["p1"],
          buyIns: [{ player: "p1", amount: 1000, at: "t" }],
          cashOuts: [{ player: "p1", amount: 1000 }],
        }),
      ],
    });
    expect(() => validateData(data)).toThrow();
  });

  it("rejects a finished game where a player has zero cash-outs", () => {
    const data = makeData({
      games: [makeGame({ cashOuts: [{ player: "p1", amount: 2000 }] })],
    });
    expect(() => validateData(data)).toThrow();
  });

  it("rejects a finished game where a player has more than one cash-out", () => {
    const data = makeData({
      games: [
        makeGame({
          cashOuts: [
            { player: "p1", amount: 1000 },
            { player: "p1", amount: 500 },
            { player: "p2", amount: 500 },
          ],
        }),
      ],
    });
    expect(() => validateData(data)).toThrow();
  });

  it("rejects a finished game where a player has no buy-in", () => {
    const data = makeData({
      games: [
        makeGame({
          players: ["p1", "p2"],
          buyIns: [{ player: "p1", amount: 2000, at: "t" }],
          cashOuts: [
            { player: "p1", amount: 1500 },
            { player: "p2", amount: 500 },
          ],
        }),
      ],
    });
    expect(() => validateData(data)).toThrow();
  });

  it("rejects a non-integer buy-in amount", () => {
    const data = makeData({
      games: [makeGame({ buyIns: [{ player: "p1", amount: 1000.5, at: "t" }, { player: "p2", amount: 1000, at: "t" }] })],
    });
    expect(() => validateData(data)).toThrow();
  });

  it("rejects a buy-in amount over the 10,000,000 cap", () => {
    const data = makeData({
      games: [
        makeGame({
          buyIns: [
            { player: "p1", amount: 10_000_001, at: "t" },
            { player: "p2", amount: 1000, at: "t" },
          ],
        }),
      ],
    });
    expect(() => validateData(data)).toThrow();
  });

  it("rejects a negative cash-out amount", () => {
    const data = makeData({
      games: [makeGame({ cashOuts: [{ player: "p1", amount: -1 }, { player: "p2", amount: 2001 }] })],
    });
    expect(() => validateData(data)).toThrow();
  });

  it("rejects a cash-out amount over the 10,000,000 cap", () => {
    const data = makeData({
      games: [
        makeGame({
          cashOuts: [
            { player: "p1", amount: 10_000_001 },
            { player: "p2", amount: 0 },
          ],
        }),
      ],
    });
    expect(() => validateData(data)).toThrow();
  });

  it("rejects a finished game that fails the chip check", () => {
    const data = makeData({
      games: [makeGame({ cashOuts: [{ player: "p1", amount: 1000 }, { player: "p2", amount: 1000 }] })],
    });
    expect(() => validateData(data)).not.toThrow();

    const broken = makeData({
      games: [makeGame({ cashOuts: [{ player: "p1", amount: 1000 }, { player: "p2", amount: 500 }] })],
    });
    expect(() => validateData(broken)).toThrow();
  });

  it("rejects a season-mode finished game that includes a guest player", () => {
    const data = makeData({
      players: [makePlayer({ id: "p1", name: "Alice" }), makePlayer({ id: "p2", name: "Guest", type: "guest" })],
      games: [makeGame({ mode: "season" })],
    });
    expect(() => validateData(data)).toThrow();
  });

  it("accepts the same players in an incognito game with a guest", () => {
    const data = makeData({
      players: [makePlayer({ id: "p1", name: "Alice" }), makePlayer({ id: "p2", name: "Guest", type: "guest" })],
      games: [makeGame({ mode: "incognito" })],
    });
    expect(() => validateData(data)).not.toThrow();
  });

  it("rejects an unknown version", () => {
    const data = { ...makeData(), version: 2 };
    expect(() => validateData(data)).toThrow();
  });

  it("rejects an empty preset buy-in list", () => {
    expect(() => validateData(makeData({ settings: { presetBuyIns: [] } }))).toThrow();
  });

  it("rejects preset buy-ins outside 1..10,000,000 or non-integer", () => {
    for (const bad of [0, -100, 10_000_001, 12.5]) {
      expect(() => validateData(makeData({ settings: { presetBuyIns: [1000, bad] } }))).toThrow();
    }
  });

  it("accepts preset buy-ins at the 1 and 10,000,000 bounds", () => {
    expect(() => validateData(makeData({ settings: { presetBuyIns: [1, 10_000_000] } }))).not.toThrow();
  });
});
