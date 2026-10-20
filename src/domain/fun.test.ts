import { describe, expect, it } from "vitest";
import {
  assignQuotes,
  badges,
  nemesis,
  playerMoods,
  playerSeasonStats,
  seasonAwards,
  seasonSummary,
  situation,
  tier,
  typicalBuyIn,
  type PlayerMood,
  type QuotePool,
} from "./fun.js";
import { QUOTES } from "./quotes.js";
import { seasonStandings } from "./standings.js";
import type { Data, Game, Player } from "./types.js";

// ---- builders -------------------------------------------------------------------------------------

const NAMES: Record<string, string> = { a: "Alice", b: "Bob", c: "Carol", d: "Dave", e: "Erin", f: "Faye" };

function player(id: string, overrides: Partial<Player> = {}): Player {
  return { id, name: NAMES[id] ?? id, type: "regular", status: "active", createdAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

// One seat: [player, buy-ins, final stack]. The caller keeps the chip check balanced.
type Seat = [string, number[], number];

let created = 0;
function game(id: string, date: string, seats: Seat[], overrides: Partial<Game> = {}): Game {
  created++;
  return {
    id,
    seasonId: "s1",
    date,
    mode: "season",
    status: "finished",
    players: seats.map(([p]) => p),
    buyIns: seats.flatMap(([p, amounts]) => amounts.map((amount) => ({ player: p, amount, at: "t" }))),
    cashOuts: seats.map(([p, , out]) => ({ player: p, amount: out })),
    createdAt: `2026-01-01T00:00:${String(created % 60).padStart(2, "0")}.000Z`,
    ...overrides,
  };
}

// Two-player game: `winner` takes `amount` off `loser`. Both buy in 1000 (loser rebuys `rebuys` times).
function duel(id: string, date: string, winner: string, loser: string, amount: number, overrides: Partial<Game> = {}): Game {
  return game(id, date, [
    [winner, [1000], 1000 + amount],
    [loser, [1000], 1000 - amount],
  ], overrides);
}

function data(games: Game[], extra: Partial<Data> = {}): Data {
  return {
    version: 1,
    settings: { presetBuyIns: [1000, 1500, 2000] },
    players: ["a", "b", "c", "d", "e", "f"].map((id) => player(id)),
    seasons: [{ id: "s1", name: "Season 1", status: "active", startedOn: "2026-01-01" }],
    games,
    liveGame: null,
    ...extra,
  };
}

function day(n: number): string {
  const d = new Date(Date.UTC(2026, 0, 1 + n));
  return d.toISOString().slice(0, 10);
}

// ---- typical buy-in -------------------------------------------------------------------------------

describe("typicalBuyIn", () => {
  it("defaults to 1000 with no games", () => {
    expect(typicalBuyIn(data([]), "s1")).toBe(1000);
  });

  it("is the most common FIRST buy-in (rebuys don't count)", () => {
    const d = data([
      game("g1", day(1), [["a", [500, 2000, 2000], 2500], ["b", [500], 2500], ["c", [2000], 2000]]),
      game("g2", day(2), [["a", [500], 500], ["b", [2000], 2000]]),
    ]);
    expect(typicalBuyIn(d, "s1")).toBe(500);
  });

  it("breaks ties toward the higher amount", () => {
    const d = data([game("g1", day(1), [["a", [500], 500], ["b", [1500], 1500]])]);
    expect(typicalBuyIn(d, "s1")).toBe(1500);
  });

  it("ignores incognito, deleted and other seasons' games", () => {
    const d = data([
      game("g1", day(1), [["a", [1500], 1500], ["b", [1500], 1500]]),
      game("g2", day(2), [["a", [500], 500], ["b", [500], 500], ["c", [500], 500]], { mode: "incognito" }),
      game("g3", day(3), [["a", [500], 500], ["b", [500], 500], ["c", [500], 500]], { status: "deleted" }),
      game("g4", day(4), [["a", [500], 500], ["b", [500], 500], ["c", [500], 500]], { seasonId: "s2" }),
    ]);
    expect(typicalBuyIn(d, "s1")).toBe(1500);
  });
});

// ---- player season stats --------------------------------------------------------------------------

describe("playerSeasonStats", () => {
  const d = data([
    game("g1", day(1), [["a", [1000], 1500], ["b", [1000], 500]]), // a +500
    game("g2", day(2), [["a", [1000, 1000, 1000], 1000], ["b", [1000], 3000]]), // a −2000 (2 rebuys)
    game("g3", day(3), [["a", [1000], 1000], ["b", [1000], 1000]]), // a $0
    game("g4", day(4), [["a", [1000], 1200], ["b", [1000], 800]]), // a +200
    game("g5", day(5), [["a", [1000, 500], 2000], ["b", [1000], 500]]), // a +500 (1 rebuy)
    game("g6", day(6), [["a", [1000], 1300], ["b", [1000], 700]]), // a +300
  ]);
  const s = playerSeasonStats(d, "s1", "a");

  it("counts games, net, average and win rate", () => {
    expect(s.games).toBe(6);
    expect(s.net).toBe(500 - 2000 + 0 + 200 + 500 + 300);
    expect(s.avgPerGame).toBeCloseTo(-500 / 6);
    expect(s.winRate).toBeCloseTo(4 / 6);
  });

  it("finds best and worst nights", () => {
    expect(s.bestNight).toMatchObject({ gameId: "g1", result: 500 }); // first of the tied +500s
    expect(s.worstNight).toMatchObject({ gameId: "g2", result: -2000, rebuys: 2 });
  });

  it("form is the last 5 results, oldest first, with E for exactly $0", () => {
    expect(s.form).toEqual(["L", "E", "W", "W", "W"]);
  });

  it("current streak counts back from the latest game", () => {
    expect(s.streak).toEqual({ kind: "win", length: 3 });
    expect(playerSeasonStats(d, "s1", "b").streak).toEqual({ kind: "loss", length: 3 });
  });

  it("a $0 night breaks the streak", () => {
    const e = data([duel("g1", day(1), "a", "b", 100), game("g2", day(2), [["a", [1000], 1000], ["b", [1000], 1000]])]);
    expect(playerSeasonStats(e, "s1", "a").streak).toBeNull();
  });

  it("rebuys per game is buy-ins minus 1, averaged", () => {
    expect(s.totalRebuys).toBe(3);
    expect(s.rebuysPerGame).toBeCloseTo(0.5);
  });

  it("lastPlayed is the latest season game date", () => {
    expect(s.lastPlayed).toBe(day(6));
  });

  it("is empty for a player with no games", () => {
    const empty = playerSeasonStats(d, "s1", "c");
    expect(empty).toMatchObject({ games: 0, net: 0, avgPerGame: 0, winRate: 0, bestNight: null, streak: null, lastPlayed: null });
  });
});

// ---- tiers ----------------------------------------------------------------------------------------

describe("tier", () => {
  const t = (net: number, games = 4, typical = 1000) => tier({ net, games }, typical);

  it("ratio exactly 0.5 is legend; just below is bond", () => {
    expect(t(2000)).toBe("legend"); // avg 500 / 1000
    expect(t(1999)).toBe("bond");
  });

  it("ratio exactly 0.2 is bond; just below is biscuit", () => {
    expect(t(800)).toBe("bond"); // avg 200
    expect(t(799)).toBe("biscuit");
  });

  it("ratio exactly −0.2 is easyTiger; just above is biscuit", () => {
    expect(t(-800)).toBe("easyTiger");
    expect(t(-799)).toBe("biscuit");
  });

  it("ratio exactly −0.5 is atm; just above is easyTiger", () => {
    expect(t(-2000)).toBe("atm");
    expect(t(-1999)).toBe("easyTiger");
  });

  it("uses the season's typical buy-in", () => {
    expect(t(2000, 4, 2000)).toBe("bond"); // avg 500 / 2000 = 0.25
    expect(t(0, 4, 2000)).toBe("biscuit");
  });

  it("fewer than 3 games is freshBlood whatever the money; 3 games gets a real tier", () => {
    expect(t(100_000, 2)).toBe("freshBlood");
    expect(t(-100_000, 2)).toBe("freshBlood");
    expect(t(1500, 3)).toBe("legend");
  });

  it("freshBlood at 2 vs 3 season games, from data", () => {
    const two = data([duel("g1", day(1), "a", "b", 900), duel("g2", day(2), "a", "b", 900)]);
    const three = data([...two.games, duel("g3", day(3), "a", "b", 900)]);
    const tierOf = (d: Data, id: string) => playerMoods(d, "s1").find((m) => m.playerId === id)!.tier;
    expect(tierOf(two, "a")).toBe("freshBlood");
    expect(tierOf(three, "a")).toBe("legend");
    expect(tierOf(three, "b")).toBe("atm");
  });
});

// ---- situations -----------------------------------------------------------------------------------

describe("situation", () => {
  it("heater: 3+ wins in a row", () => {
    const d = data([duel("g1", day(1), "a", "b", 100), duel("g2", day(2), "a", "b", 100), duel("g3", day(3), "a", "b", 100)]);
    expect(situation(d, "s1", "a")).toBe("heater");
    const two = data(d.games.slice(1));
    expect(situation(two, "s1", "a")).toBeNull();
  });

  it("comeback: latest game had 2+ rebuys and finished up", () => {
    const comeback = game("g2", day(2), [["a", [1000, 1000, 1000], 3500], ["b", [1000], 500]]);
    expect(situation(data([duel("g1", day(1), "b", "a", 100), comeback]), "s1", "a")).toBe("comeback");
    const oneRebuy = game("g2", day(2), [["a", [1000, 1000], 2500], ["b", [1000], 500]]);
    expect(situation(data([duel("g1", day(1), "b", "a", 100), oneRebuy]), "s1", "a")).toBeNull();
    const downAfter = game("g2", day(2), [["a", [1000, 1000, 1000], 2500], ["b", [1000], 1500]]);
    expect(situation(data([duel("g1", day(1), "b", "a", 100), downAfter]), "s1", "a")).toBeNull();
  });

  it("coldStreak: 3+ losses in a row", () => {
    const d = data([duel("g1", day(1), "a", "b", 100), duel("g2", day(2), "a", "b", 100), duel("g3", day(3), "a", "b", 100)]);
    expect(situation(d, "s1", "b")).toBe("coldStreak");
  });

  it("rebuyKing: highest rebuys/game, 3+ games, at least 1.0", () => {
    const r = (id: string, date: string, aBuys: number[]) =>
      game(id, date, [["a", aBuys, 1000], ["b", [1000], aBuys.reduce((s, x) => s + x, 0)], ["c", [1000], 1000]]);
    // a rebuys 1, 0, 1 → 0.67 per game: not king
    const d = data([r("g1", day(1), [1000, 1000]), duel("g2", day(2), "a", "c", 2000), r("g3", day(3), [1000, 1000])]);
    expect(situation(d, "s1", "a")).toBeNull();
    const king = data([r("g1", day(1), [1000, 1000]), r("g2", day(2), [1000, 1000]), game("g3", day(3), [["a", [1000, 1000], 2500], ["b", [1000], 500]])]);
    expect(playerSeasonStats(king, "s1", "a").rebuysPerGame).toBe(1);
    expect(situation(king, "s1", "a")).toBe("rebuyKing");
  });

  it("rebuyKing needs 3 games", () => {
    const d = data([
      game("g1", day(1), [["a", [1000, 1000, 1000], 1000], ["b", [1000], 3000]]),
      game("g2", day(2), [["a", [1000, 1000, 1000], 2000], ["b", [1000], 2000]]),
    ]);
    expect(situation(d, "s1", "a")).toBeNull();
  });

  it("rebuyKing ties share the crown", () => {
    const g = (id: string, date: string, aWins: boolean) =>
      game(id, date, [["a", [1000, 1000], aWins ? 2500 : 1500], ["b", [1000, 1000], aWins ? 1500 : 2500]]);
    const d = data([g("g1", day(1), true), g("g2", day(2), false), g("g3", day(3), true)]);
    expect(situation(d, "s1", "a")).toBe("rebuyKing");
    expect(situation(d, "s1", "b")).toBe("rebuyKing");
  });

  it("backAfterBreak: 14+ days between their last two games, and the latest is the season's latest", () => {
    const base = [duel("g1", day(1), "a", "b", 100), duel("g2", day(5), "b", "c", 100)];
    const back = data([...base, duel("g3", day(15), "c", "a", 100)]); // a: day 1 → day 15
    expect(situation(back, "s1", "a")).toBe("backAfterBreak");
    const thirteen = data([...base, duel("g3", day(14), "c", "a", 100)]);
    expect(situation(thirteen, "s1", "a")).toBeNull();
    const notLatest = data([...back.games, duel("g4", day(16), "b", "c", 100)]);
    expect(situation(notLatest, "s1", "a")).toBeNull();
  });

  describe("priority (first that applies wins)", () => {
    it("heater beats comeback", () => {
      const d = data([
        duel("g1", day(1), "a", "b", 100),
        duel("g2", day(2), "a", "b", 100),
        game("g3", day(3), [["a", [1000, 1000, 1000], 3500], ["b", [1000], 500]]),
      ]);
      expect(situation(d, "s1", "a")).toBe("heater");
    });

    it("comeback beats rebuyKing", () => {
      const r = (id: string, date: string) => game(id, date, [["a", [1000, 1000, 1000], 3100], ["b", [1000], 900]]);
      const d = data([duel("g0", day(0), "b", "a", 100), r("g1", day(1)), duel("g2", day(2), "b", "a", 100), r("g3", day(3))]);
      expect(playerSeasonStats(d, "s1", "a").rebuysPerGame).toBeGreaterThanOrEqual(1);
      expect(situation(d, "s1", "a")).toBe("comeback");
    });

    it("coldStreak beats rebuyKing", () => {
      const r = (id: string, date: string) => game(id, date, [["a", [1000, 1000], 1500], ["b", [1000], 1500]]);
      const d = data([r("g1", day(1)), r("g2", day(2)), r("g3", day(3))]);
      expect(situation(d, "s1", "a")).toBe("coldStreak");
    });

    it("rebuyKing beats backAfterBreak", () => {
      const r = (id: string, date: string, aUp: boolean) =>
        game(id, date, [["a", [1000, 1000], aUp ? 2100 : 1900], ["b", [1000], aUp ? 900 : 1100]]);
      const d = data([r("g1", day(1), true), r("g2", day(2), false), r("g3", day(20), true)]);
      expect(situation(d, "s1", "a")).toBe("rebuyKing");
    });

    it("heater beats backAfterBreak", () => {
      const d = data([duel("g1", day(1), "a", "b", 100), duel("g2", day(2), "a", "b", 100), duel("g3", day(30), "a", "b", 100)]);
      expect(situation(d, "s1", "a")).toBe("heater");
    });
  });
});

// ---- daily quotes ---------------------------------------------------------------------------------

function mood(id: string, pool: QuotePool, extra: Partial<PlayerMood["stats"]> = {}): PlayerMood {
  const isSituation = !["legend", "bond", "biscuit", "easyTiger", "atm", "freshBlood"].includes(pool);
  return {
    playerId: id,
    name: NAMES[id] ?? id,
    tier: isSituation ? "biscuit" : (pool as PlayerMood["tier"]),
    situation: isSituation ? (pool as PlayerMood["situation"]) : null,
    stats: {
      playerId: id, games: 5, net: 0, avgPerGame: 0, winRate: 0, bestNight: null, worstNight: null,
      form: [], streak: null, totalRebuys: 0, rebuysPerGame: 0, lastPlayed: null, nights: [],
      ...extra,
    },
  };
}

describe("assignQuotes", () => {
  const ten = Array.from({ length: 10 }, (_, i) => mood(`p${i}`, (["legend", "bond", "biscuit", "easyTiger", "atm"] as const)[i % 5]!));

  it("every pool has lines", () => {
    for (const lines of Object.values(QUOTES)) expect(lines.length).toBeGreaterThan(0);
  });

  it("is deterministic for the same day and season", () => {
    expect(assignQuotes(ten, "20261019", "s1")).toEqual(assignQuotes(ten, "20261019", "s1"));
    expect(assignQuotes(ten, "2026-10-19", "s1")).toEqual(assignQuotes(ten, "20261019", "s1"));
  });

  it("changes the next day — every player, every day, across many days", () => {
    const solo = [mood("a", "heater"), mood("b", "comeback"), mood("c", "legend")];
    let prev = assignQuotes(solo, day(0).replaceAll("-", ""), "s1");
    for (let n = 1; n < 120; n++) {
      const next = assignQuotes(solo, day(n), "s1");
      next.forEach((q, i) => expect(q.line).not.toBe(prev[i]!.line));
      prev = next;
    }
  });

  it("the next day differs for the 10-player table", () => {
    const today = assignQuotes(ten, "20261019", "s1").map((q) => q.line);
    const tomorrow = assignQuotes(ten, "20261020", "s1").map((q) => q.line);
    expect(tomorrow).not.toEqual(today);
  });

  it("depends on the season", () => {
    const days = Array.from({ length: 10 }, (_, n) => day(n));
    const lines = (s: string) => days.map((dd) => assignQuotes(ten, dd, s).map((q) => q.line).join("|")).join("\n");
    expect(lines("s1")).not.toEqual(lines("s2"));
  });

  it("no duplicate lines among 10 players when each pool is big enough (many days)", () => {
    for (let n = 0; n < 60; n++) {
      const lines = assignQuotes(ten, day(n), "s1").map((q) => q.line);
      expect(new Set(lines).size).toBe(10);
    }
  });

  it("no duplicates when one pool holds exactly as many players as lines", () => {
    const eight = Array.from({ length: QUOTES.legend.length }, (_, i) => mood(`p${i}`, "legend"));
    for (let n = 0; n < 30; n++) {
      const lines = assignQuotes(eight, day(n), "s1").map((q) => q.line);
      expect(new Set(lines).size).toBe(eight.length);
    }
  });

  it("repeats only once the pool is exhausted", () => {
    const pool = { ...QUOTES, heater: ["one", "two", "three"] };
    const five = Array.from({ length: 5 }, (_, i) => mood(`p${i}`, "heater"));
    for (let n = 0; n < 30; n++) {
      const lines = assignQuotes(five, day(n), "s1", pool).map((q) => q.line);
      expect(new Set(lines.slice(0, 3)).size).toBe(3); // first 3 players use up the pool
      expect(new Set(lines.slice(3)).size).toBe(2); // the pool starts over for the rest
    }
  });

  it("uses the situation's pool over the tier's", () => {
    const [q] = assignQuotes([mood("a", "coldStreak")], "20261019", "s1");
    expect(q!.pool).toBe("coldStreak");
  });

  it("fills {name}, {n} and {r}", () => {
    const pool = { ...QUOTES, heater: ["{name}: {n} in a row"], comeback: ["{name} rebought {r}"], rebuyKing: ["{r}/game"] };
    const night = { gameId: "g", date: day(1), result: 500, rebuys: 3 };
    const out = assignQuotes(
      [
        mood("a", "heater", { streak: { kind: "win", length: 4 } }),
        mood("b", "comeback", { nights: [night] }),
        mood("c", "rebuyKing", { rebuysPerGame: 4 / 3, nights: [night] }),
      ],
      "20261019",
      "s1",
      pool,
    );
    expect(out.map((q) => q.line)).toEqual(["Alice: 4 in a row", "Bob rebought 3", "1.3/game"]);
  });

  it("fills placeholders in the real lines", () => {
    const out = assignQuotes(
      [mood("a", "heater", { streak: { kind: "win", length: 5 } })],
      "20261019",
      "s1",
      { ...QUOTES, heater: [QUOTES.heater[0]!] },
    );
    expect(out[0]!.line).toBe("On a heater: 5 wins in a row.");
  });
});

// ---- nemesis --------------------------------------------------------------------------------------

describe("nemesis", () => {
  it("needs 3 games where P was down and Q was up", () => {
    const two = data([duel("g1", day(1), "b", "a", 100), duel("g2", day(2), "b", "a", 100)]);
    expect(nemesis(two, "s1", "a")).toBeNull();
    const three = data([...two.games, duel("g3", day(3), "b", "a", 100)]);
    expect(nemesis(three, "s1", "a")).toEqual({ playerId: "b", name: "Bob", games: 3, won: 300 });
  });

  it("only counts games where P finished down", () => {
    const d = data([
      game("g1", day(1), [["a", [1000], 900], ["b", [1000], 1200], ["c", [1000], 900]]),
      game("g2", day(2), [["a", [1000], 900], ["b", [1000], 1200], ["c", [1000], 900]]),
      game("g3", day(3), [["a", [1000], 1000], ["b", [1000], 1200], ["c", [1000], 800]]), // a even
    ]);
    expect(nemesis(d, "s1", "a")).toBeNull();
  });

  it("ties → more won, then name A→Z", () => {
    const g = (id: string, date: string, bWin: number, cWin: number) =>
      game(id, date, [["a", [1000], 1000 - bWin - cWin], ["b", [1000], 1000 + bWin], ["c", [1000], 1000 + cWin]]);
    const moreWon = data([g("g1", day(1), 100, 200), g("g2", day(2), 100, 200), g("g3", day(3), 100, 200)]);
    expect(nemesis(moreWon, "s1", "a")?.playerId).toBe("c");
    const equal = data([g("g1", day(1), 100, 100), g("g2", day(2), 100, 100), g("g3", day(3), 100, 100)]);
    expect(nemesis(equal, "s1", "a")?.playerId).toBe("b");
  });

  it("most games wins over more money", () => {
    const d = data([
      duel("g1", day(1), "b", "a", 100), duel("g2", day(2), "b", "a", 100),
      duel("g3", day(3), "b", "a", 100), duel("g4", day(4), "b", "a", 100),
      duel("g5", day(5), "c", "a", 900), duel("g6", day(6), "c", "a", 900), duel("g7", day(7), "c", "a", 900),
    ]);
    expect(nemesis(d, "s1", "a")).toMatchObject({ playerId: "b", games: 4 });
  });
});

// ---- badges ---------------------------------------------------------------------------------------

describe("badges", () => {
  const kinds = (d: Data, id: string) => badges(d, id).map((b) => `${b.kind}@${b.gameId}`);

  it("firstBlood: first winning game", () => {
    const d = data([duel("g1", day(1), "b", "a", 100), duel("g2", day(2), "a", "b", 100), duel("g3", day(3), "a", "b", 100)]);
    expect(kinds(d, "a")).toContain("firstBlood@g2");
  });

  it("hatTrick: the game that makes 3 wins in a row; $0 breaks the run", () => {
    const even = game("gE", day(3), [["a", [1000], 1000], ["b", [1000], 1000]]);
    const d = data([
      duel("g1", day(1), "a", "b", 100), duel("g2", day(2), "a", "b", 100), even,
      duel("g4", day(4), "a", "b", 100), duel("g5", day(5), "a", "b", 100), duel("g6", day(6), "a", "b", 100),
    ]);
    expect(kinds(d, "a")).toContain("hatTrick@g6");
  });

  it("doubleUp: cash out ≥ 2× total buy-in", () => {
    const near = game("g1", day(1), [["a", [1000, 500], 2999], ["b", [1500], 1]]);
    const exact = game("g2", day(2), [["a", [1000, 500], 3000], ["b", [1500], 0]]);
    expect(kinds(data([near]), "a")).not.toContain("doubleUp@g1");
    expect(kinds(data([near, exact]), "a")).toContain("doubleUp@g2");
  });

  it("phoenix: 3+ rebuys and finished up", () => {
    const two = game("g1", day(1), [["a", [1000, 1000, 1000], 3500], ["b", [1000], 500]]);
    const three = game("g2", day(2), [["a", [1000, 1000, 1000, 1000], 4500], ["b", [1000], 500]]);
    const threeDown = game("g3", day(3), [["a", [1000, 1000, 1000, 1000], 3500], ["b", [1000], 1500]]);
    expect(kinds(data([two, threeDown]), "a").some((k) => k.startsWith("phoenix"))).toBe(false);
    expect(kinds(data([two, threeDown, three]), "a")).toContain("phoenix@g2");
  });

  it("tenClub at the 10th season game, halfCentury at the 50th", () => {
    const games = Array.from({ length: 50 }, (_, i) => duel(`g${i + 1}`, day(i + 1), "b", "a", 10));
    expect(kinds(data(games.slice(0, 9)), "a")).toEqual([]);
    expect(kinds(data(games), "a")).toEqual(["tenClub@g10", "halfCentury@g50"]);
  });

  it("are all-time: counted across seasons, in date order", () => {
    const d = data(
      [duel("g2", day(20), "a", "b", 100, { seasonId: "s2" }), duel("g1", day(10), "a", "b", 100)],
      { seasons: [{ id: "s1", name: "Season 1", status: "closed", startedOn: day(0), endedOn: day(15) }, { id: "s2", name: "Season 2", status: "active", startedOn: day(16) }] },
    );
    expect(kinds(d, "a")).toEqual(["firstBlood@g1"]);
  });

  it("ignore incognito and deleted games", () => {
    const d = data([
      duel("g1", day(1), "a", "b", 5000, { mode: "incognito" }),
      duel("g2", day(2), "a", "b", 5000, { status: "deleted" }),
      duel("g3", day(3), "a", "b", 5000, { mode: "incognito" }),
    ]);
    expect(badges(d, "a")).toEqual([]);
  });
});

// ---- season awards --------------------------------------------------------------------------------

describe("seasonAwards", () => {
  // a: steady winner (3 games). b: rebuys and swings. c: 2 games only, one huge night.
  const d = data([
    game("g1", day(1), [["a", [1000], 1300], ["b", [1000, 1000, 1000], 700], ["c", [1000], 3000]]),
    game("g2", day(2), [["a", [1000], 1300], ["b", [1000, 1000, 1000], 3700], ["c", [1000], 0]]),
    game("g3", day(3), [["a", [1000], 1300], ["b", [1000], 700]]),
  ]);
  const awards = seasonAwards(d, "s1");

  it("shark: best average (3+ games only)", () => {
    expect(awards.shark).toMatchObject({ playerIds: ["a"], value: 300 }); // c's +1000 avg is ignored (2 games)
  });

  it("atm: most total rebuys", () => {
    expect(awards.atm).toMatchObject({ playerIds: ["b"], value: 4 });
  });

  it("rock: fewest rebuys per game (3+ games only)", () => {
    expect(awards.rock).toMatchObject({ playerIds: ["a"], value: 0 }); // c also has 0 but only 2 games
  });

  it("comebackKid: most comeback games", () => {
    expect(awards.comebackKid).toMatchObject({ playerIds: ["b"], value: 1 });
  });

  it("bigNight: largest single-game win", () => {
    expect(awards.bigNight).toMatchObject({ playerIds: ["c"], value: 2000 }); // 2 games is enough for a count award
  });

  it("rollercoaster: highest standard deviation (3+ games only)", () => {
    expect(awards.rollercoaster?.playerIds).toEqual(["b"]);
  });

  it("ironMan: most games, ties share", () => {
    expect(awards.ironMan).toMatchObject({ playerIds: ["a", "b"], value: 3 });
  });

  it("is live while the season is active and final once closed", () => {
    expect(awards.shark?.final).toBe(false);
    const closed = { ...d, seasons: [{ ...d.seasons[0]!, status: "closed" as const, endedOn: day(10) }] };
    expect(seasonAwards(closed, "s1").shark?.final).toBe(true);
  });

  describe("ties share when not everyone ties", () => {
    const winners = (d: Data) => {
      const a = seasonAwards(d, "s1");
      return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v?.playerIds ?? null]));
    };

    it("shark and bigNight", () => {
      const g = (id: string, date: string) => game(id, date, [["a", [1000], 1100], ["b", [1000], 1100], ["c", [1000], 800]]);
      const w = winners(data([g("g1", day(1)), g("g2", day(2)), g("g3", day(3))]));
      expect(w.shark).toEqual(["a", "b"]);
      expect(w.bigNight).toEqual(["a", "b"]);
    });

    it("atm and comebackKid", () => {
      const g = (id: string, date: string) =>
        game(id, date, [["a", [1000, 1000, 1000], 3500], ["b", [1000, 1000, 1000], 3500], ["c", [2000], 1000]]);
      const w = winners(data([g("g1", day(1)), g("g2", day(2)), g("g3", day(3))]));
      expect(w.atm).toEqual(["a", "b"]);
      expect(w.comebackKid).toEqual(["a", "b"]);
    });

    it("rock", () => {
      const g = (id: string, date: string) => game(id, date, [["a", [1000], 1500], ["b", [1000], 1500], ["c", [1000, 1000], 1000]]);
      expect(winners(data([g("g1", day(1)), g("g2", day(2)), g("g3", day(3))])).rock).toEqual(["a", "b"]);
    });

    it("rollercoaster", () => {
      // c loses a steady $200 a night; a and b swing by the same amount.
      const up = (id: string, date: string) => game(id, date, [["a", [1000], 1700], ["b", [1000], 500], ["c", [1000], 800]]);
      const down = (id: string, date: string) => game(id, date, [["a", [1000], 700], ["b", [1000], 1500], ["c", [1000], 800]]);
      expect(winners(data([up("g1", day(1)), down("g2", day(2)), up("g3", day(3))])).rollercoaster).toEqual(["a", "b"]);
    });

    it("ironMan", () => {
      const three = (id: string, date: string) => game(id, date, [["a", [1000], 1100], ["b", [1000], 1000], ["c", [1000], 900]]);
      const w = winners(data([three("g1", day(1)), three("g2", day(2)), duel("g3", day(3), "a", "b", 100)]));
      expect(w.ironMan).toEqual(["a", "b"]);
    });
  });

  it("if every qualifying player ties, nobody gets it", () => {
    // a and b mirror each other: every award is a two-way tie between the only two players.
    const mirror = data([
      game("g1", day(1), [["a", [1000, 1000, 1000], 3500], ["b", [1000, 1000, 1000], 2500]]),
      game("g2", day(2), [["a", [1000, 1000, 1000], 2500], ["b", [1000, 1000, 1000], 3500]]),
      game("g3", day(3), [["a", [1000, 1000, 1000], 3500], ["b", [1000, 1000, 1000], 2500]]),
      game("g4", day(4), [["a", [1000, 1000, 1000], 2500], ["b", [1000, 1000, 1000], 3500]]),
    ]);
    const a = seasonAwards(mirror, "s1");
    for (const kind of ["shark", "atm", "rock", "comebackKid", "bigNight", "rollercoaster", "ironMan"] as const) {
      expect(a[kind], kind).toBeNull();
    }
    // Ties among the qualifiers only: c (2 games) doesn't qualify for shark, so a and b are all of them.
    const plusC = data([...mirror.games, duel("g5", day(5), "c", "a", 0), duel("g6", day(6), "c", "b", 0)]);
    expect(seasonAwards(plusC, "s1").shark).toBeNull();
    // A lone qualifier isn't a tie.
    const lone = data([duel("g1", day(1), "a", "b", 100), duel("g2", day(2), "a", "c", 100), duel("g3", day(3), "a", "d", 100)]);
    expect(seasonAwards(lone, "s1").shark).toMatchObject({ playerIds: ["a"], value: 100 });
  });

  it("rock needs at least one qualifying player who rebought", () => {
    // a is the only player with 3+ games and never rebought; b rebought but has only 2 games.
    const d = data([
      game("g1", day(1), [["a", [1000], 1500], ["b", [1000, 1000], 1500]]),
      game("g2", day(2), [["a", [1000], 1500], ["b", [1000, 1000], 1500]]),
      duel("g3", day(3), "a", "c", 100),
    ]);
    expect(seasonAwards(d, "s1").rock).toBeNull();
    const rebought = data([...d.games.slice(0, 2), game("g3", day(3), [["a", [1000], 1500], ["b", [1000, 1000], 1500]])]);
    // Now b has 3 games too (1 rebuy/game), so a qualifying player rebought: a's 0/game earns it.
    expect(seasonAwards(rebought, "s1").rock).toMatchObject({ playerIds: ["a"], value: 0 });
  });

  it("is null when nobody qualifies", () => {
    const none = seasonAwards(data([]), "s1");
    expect(Object.values(none).every((x) => x === null)).toBe(true);
    const short = seasonAwards(data([duel("g1", day(1), "a", "b", 100)]), "s1");
    expect(short.shark).toBeNull();
    expect(short.rock).toBeNull();
    expect(short.rollercoaster).toBeNull();
    expect(short.atm).toBeNull(); // nobody rebought
    expect(short.comebackKid).toBeNull();
    expect(short.bigNight).toMatchObject({ playerIds: ["a"], value: 100 });
  });
});

// ---- season summary -------------------------------------------------------------------------------

describe("seasonSummary", () => {
  const d = data([
    duel("g1", day(1), "a", "b", 300),
    game("g2", day(2), [["a", [1000], 1500], ["b", [1000, 1000, 1000], 3500], ["c", [1000], 0]]),
    duel("g3", day(3), "a", "c", 200),
    duel("gi", day(4), "c", "a", 5000, { mode: "incognito" }),
    duel("gd", day(4), "c", "a", 5000, { status: "deleted" }),
  ]);
  const s = seasonSummary(d, "s1", day(9))!;

  it("summarises the season", () => {
    expect(s).toMatchObject({
      name: "Season 1",
      startedOn: "2026-01-01",
      daysRunning: 10,
      gamesPlayed: 3,
      totalBuyIns: 2000 + 5000 + 2000,
      leader: { playerId: "a", name: "Alice", net: 1000 },
      biggestNight: { playerId: "a", amount: 500, date: day(2), gameId: "g2" }, // ties with Bob → name A→Z
      longestWinStreak: { playerIds: ["a"], length: 3 },
      incognitoGames: 1,
    });
  });

  it("rebuy king needs 3 games and 1.0/game", () => {
    expect(s.rebuyKings).toEqual([]);
  });

  it("a closed season stops counting days at endedOn", () => {
    const closed = { ...d, seasons: [{ ...d.seasons[0]!, status: "closed" as const, endedOn: day(4) }] };
    expect(seasonSummary(closed, "s1", day(100))!.daysRunning).toBe(5);
  });

  it("an empty season has no leader, night or streak", () => {
    expect(seasonSummary(data([]), "s1", day(0))).toMatchObject({
      daysRunning: 1, gamesPlayed: 0, totalBuyIns: 0, leader: null, biggestNight: null, longestWinStreak: null, incognitoGames: 0,
    });
    expect(seasonSummary(data([]), "nope", day(0))).toBeNull();
  });
});

// ---- incognito / deleted never count --------------------------------------------------------------

describe("incognito and deleted games never count", () => {
  const base = [
    duel("g1", day(1), "a", "b", 300),
    game("g2", day(2), [["a", [1000], 1500], ["b", [1000, 1000, 1000], 3500], ["c", [1000], 0]]),
    duel("g3", day(3), "b", "a", 200),
    duel("g4", day(4), "c", "a", 100),
  ];
  // Wild games that would change every number if they counted.
  const noise = [
    game("x1", day(5), [["a", [500, 500, 500, 500], 6000], ["b", [2000], 0]], { mode: "incognito" }),
    game("x2", day(6), [["c", [500, 500, 500, 500], 6000], ["a", [2000], 0]], { status: "deleted" }),
    duel("x3", day(7), "b", "a", 900, { mode: "incognito" }),
    duel("x4", day(8), "b", "a", 900, { status: "deleted" }),
    duel("x5", day(9), "b", "a", 900, { mode: "incognito" }),
  ];
  const clean = data(base);
  const noisy = data([...base, ...noise]);

  it("everything matches with or without them", () => {
    expect(typicalBuyIn(noisy, "s1")).toBe(typicalBuyIn(clean, "s1"));
    expect(playerMoods(noisy, "s1")).toEqual(playerMoods(clean, "s1"));
    for (const id of ["a", "b", "c"]) {
      expect(situation(noisy, "s1", id)).toBe(situation(clean, "s1", id));
      expect(nemesis(noisy, "s1", id)).toEqual(nemesis(clean, "s1", id));
      expect(badges(noisy, id)).toEqual(badges(clean, id));
    }
    expect(seasonAwards(noisy, "s1")).toEqual(seasonAwards(clean, "s1"));
    expect(assignQuotes(playerMoods(noisy, "s1"), "20261019", "s1")).toEqual(assignQuotes(playerMoods(clean, "s1"), "20261019", "s1"));
    const { incognitoGames: ni, ...noisySummary } = seasonSummary(noisy, "s1", day(10))!;
    const { incognitoGames: ci, ...cleanSummary } = seasonSummary(clean, "s1", day(10))!;
    expect(noisySummary).toEqual(cleanSummary);
    expect([ni, ci]).toEqual([3, 0]);
  });
});

// ---- zero-sum property ----------------------------------------------------------------------------

describe("zero-sum invariant (stats engine)", () => {
  function seededRandom(seed: number) {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
  }

  it("season nets from playerSeasonStats sum to $0 and match the standings", () => {
    const seed = 51;
    const rand = seededRandom(seed);
    const ids = ["a", "b", "c", "d", "e", "f"];
    const games: Game[] = [];
    for (let i = 0; i < 200; i++) {
      const seated = ids.filter(() => rand() < 0.7);
      if (seated.length < 2) continue;
      const seats: Seat[] = seated.map((p) => [p, Array.from({ length: 1 + Math.floor(rand() * 4) }, () => 500 + Math.floor(rand() * 4) * 500), 0]);
      const totalIn = seats.reduce((s, [, b]) => s + b.reduce((x, y) => x + y, 0), 0);
      const shares = seats.map(() => rand());
      const shareSum = shares.reduce((s, x) => s + x, 0);
      seats.forEach((seat, j) => (seat[2] = Math.floor((shares[j]! / shareSum) * totalIn)));
      seats[0]![2] += totalIn - seats.reduce((s, [, , out]) => s + out, 0);
      const mode = rand() < 0.15 ? "incognito" : "season";
      const status = rand() < 0.1 ? "deleted" : "finished";
      games.push(game(`g${i}`, day(Math.floor(i / 2)), seats, { mode, status }));
    }
    const d = data(games);
    const moods = playerMoods(d, "s1");
    const total = moods.reduce((s, m) => s + m.stats.net, 0);
    if (total !== 0) throw new Error(`Zero-sum invariant failed with seed ${seed}: total net was ${total}`);
    expect(total).toBe(0);
    const standings = new Map(seasonStandings(d, "s1").map((r) => [r.playerId, r]));
    for (const m of moods) {
      expect(m.stats.net).toBe(standings.get(m.playerId)!.net);
      expect(m.stats.games).toBe(standings.get(m.playerId)!.gamesPlayed);
    }
  });
});
