import { describe, expect, it } from "vitest";
import {
  addBuyIn,
  addLatePlayer,
  clearMarkerChange,
  endCheck,
  finishGameChange,
  finishLocalGame,
  lastGamePlayers,
  lateNeedsGuestChoice,
  liveState,
  playerTotal,
  removePlayer,
  setFinalStack,
  startGame,
  startMarkerChange,
  tableTotal,
  undo,
  type LocalGame,
} from "./liveGame.js";
import { validateData } from "./schema.js";
import type { Data, Game, Player } from "./types.js";

const NOW = "2026-10-24T21:04:00.000Z";

function player(id: string, name: string, overrides: Partial<Player> = {}): Player {
  return { id, name, type: "regular", status: "active", createdAt: NOW, ...overrides };
}

function makeData(overrides: Partial<Data> = {}): Data {
  return {
    version: 1,
    settings: { presetBuyIns: [1000, 1500, 2000] },
    players: [
      player("a", "Amit"),
      player("r", "Rohan", { type: "guest" }),
      player("s", "Shreyas"),
      player("x", "Old", { status: "archived" }),
      player("g", "Gita", { type: "guest" }),
    ],
    seasons: [{ id: "s1", name: "Season 1", status: "active", startedOn: "2026-10-01" }],
    games: [],
    liveGame: null,
    ...overrides,
  };
}

const nameOf = (id: string) => makeData().players.find((p) => p.id === id)?.name ?? id;

function start(data = makeData(), overrides: Partial<Parameters<typeof startGame>[1]> = {}): LocalGame {
  return startGame(data, {
    id: "G1",
    playerIds: ["a", "s"],
    mode: "season",
    guestChoice: null,
    date: "2026-10-24",
    now: NOW,
    ...overrides,
  });
}

function finishWith(game: LocalGame, stacks: Record<string, string>): LocalGame {
  return Object.entries(stacks).reduce((g, [p, text]) => setFinalStack(g, p, text), game);
}

describe("startGame", () => {
  it("creates a local game in the active season with the given date and players", () => {
    const g = start();
    expect(g).toMatchObject({ id: "G1", seasonId: "s1", date: "2026-10-24", startMode: "season", markerSynced: false });
    expect(liveState(g).players).toEqual(["a", "s"]);
  });

  it("needs an active season, 2+ distinct players, and active players only", () => {
    expect(() => start(makeData({ seasons: [] }))).toThrow(/season/);
    expect(() => start(undefined, { playerIds: ["a"] })).toThrow(/at least 2/);
    expect(() => start(undefined, { playerIds: ["a", "a"] })).toThrow(/twice/);
    expect(() => start(undefined, { playerIds: ["a", "x"] })).toThrow(/archived/);
    expect(() => start(undefined, { date: "24/10/2026" })).toThrow(/date/);
  });

  it("forces the guest choice for a season game with a guest", () => {
    expect(() => start(undefined, { playerIds: ["a", "r"] })).toThrow(/guests/);
  });

  it("keep incognito: forces the game to incognito and promotes nobody", () => {
    const g = start(undefined, { playerIds: ["a", "r"], guestChoice: "incognito" });
    expect(liveState(g)).toMatchObject({ mode: "incognito", promote: [] });
  });

  it("add to season: stays a season game and promotes the guests at finish", () => {
    const g = start(undefined, { playerIds: ["a", "r", "g"], guestChoice: "promote" });
    expect(liveState(g)).toMatchObject({ mode: "season", promote: ["r", "g"] });
  });

  it("an incognito game with guests needs no choice", () => {
    const g = start(undefined, { playerIds: ["a", "r"], mode: "incognito" });
    expect(liveState(g)).toMatchObject({ mode: "incognito", promote: [] });
  });
});

describe("during play", () => {
  it("tracks buy-ins, rebuys, custom amounts, per-player and table totals", () => {
    let g = start();
    g = addBuyIn(g, "a", 1000, NOW);
    g = addBuyIn(g, "a", 1500, NOW);
    g = addBuyIn(g, "s", 777, NOW);
    const state = liveState(g);
    expect(playerTotal(state, "a")).toBe(2500);
    expect(playerTotal(state, "s")).toBe(777);
    expect(tableTotal(state)).toBe(3277);
  });

  it("rejects bad amounts and players not in the game", () => {
    const g = start();
    expect(() => addBuyIn(g, "a", 0, NOW)).toThrow();
    expect(() => addBuyIn(g, "a", 12.5, NOW)).toThrow();
    expect(() => addBuyIn(g, "a", 10_000_001, NOW)).toThrow();
    expect(() => addBuyIn(g, "r", 1000, NOW)).toThrow(/isn't in this game/);
  });

  it("undo removes only the last action, and is a no-op with nothing to undo", () => {
    let g = start();
    expect(undo(g)).toBe(g);
    g = addBuyIn(g, "a", 1000, NOW);
    g = addBuyIn(g, "s", 2000, NOW);
    g = undo(g);
    expect(liveState(g).buyIns).toEqual([{ player: "a", amount: 1000, at: NOW }]);
  });

  it("adds a late player, and undo takes them back out", () => {
    const data = makeData({ players: [...makeData().players, player("d", "Dev")] });
    const before = addBuyIn(start(data), "a", 1000, NOW);
    let g = addLatePlayer(data, before, "d", NOW);
    g = addBuyIn(g, "d", 1500, NOW);
    expect(liveState(g).players).toEqual(["a", "s", "d"]);
    expect(playerTotal(liveState(g), "d")).toBe(1500);
    g = undo(g); // the late buy-in
    g = undo(g); // the late player
    expect(g).toEqual(before);
  });

  it("refuses a late player already in the game or archived", () => {
    const g = start();
    expect(() => addLatePlayer(makeData(), g, "a", NOW)).toThrow(/already/);
    expect(() => addLatePlayer(makeData(), g, "x", NOW)).toThrow(/archived/);
  });

  it("a late guest in a season game needs the choice: promote, or switch the game to incognito", () => {
    const data = makeData();
    const g = start();
    expect(lateNeedsGuestChoice(data, g, "r")).toBe(true);
    expect(() => addLatePlayer(data, g, "r", NOW)).toThrow(/guest/);

    const promoted = addLatePlayer(data, g, "r", NOW, "promote");
    expect(liveState(promoted)).toMatchObject({ mode: "season", promote: ["r"] });

    const incog = addLatePlayer(data, g, "r", NOW, "incognito");
    expect(liveState(incog)).toMatchObject({ mode: "incognito", promote: [] });
    expect(liveState(undo(incog)).mode).toBe("season");
  });

  it("a late guest in an incognito game needs no choice", () => {
    const g = start(undefined, { mode: "incognito" });
    expect(lateNeedsGuestChoice(makeData(), g, "r")).toBe(false);
    expect(liveState(addLatePlayer(makeData(), g, "r", NOW)).players).toContain("r");
  });

  it("removes a player only while they have no buy-ins", () => {
    let g = start(undefined, { playerIds: ["a", "s", "r"], mode: "incognito" });
    g = addBuyIn(g, "a", 1000, NOW);
    expect(() => removePlayer(g, "a", NOW)).toThrow(/final stack/);
    g = removePlayer(g, "r", NOW);
    expect(liveState(g).players).toEqual(["a", "s"]);
    expect(liveState(undo(g)).players).toEqual(["a", "s", "r"]);
  });

  it("survives a JSON round trip (localStorage autosave)", () => {
    let g = start();
    g = addBuyIn(g, "a", 1000, NOW);
    g = setFinalStack(g, "a", "1,000");
    const restored = JSON.parse(JSON.stringify(g)) as LocalGame;
    expect(restored).toEqual(g);
    expect(liveState(restored)).toEqual(liveState(g));
  });
});

describe("endCheck (strict chip check)", () => {
  function played(): LocalGame {
    let g = start();
    g = addBuyIn(g, "a", 1000, NOW);
    g = addBuyIn(g, "a", 1500, NOW);
    g = addBuyIn(g, "s", 1000, NOW);
    return g;
  }

  it("passes when stacks equal buy-ins, including a $0 stack", () => {
    const check = endCheck(finishWith(played(), { a: "3,500", s: "0" }), nameOf);
    expect(check).toMatchObject({ ok: true, blockers: [], gap: 0, hint: null });
  });

  it("blocks with the exact gap and the missed-rebuy hint", () => {
    const short = endCheck(finishWith(played(), { a: "1000", s: "0" }), nameOf);
    expect(short).toMatchObject({ ok: false, gap: -2500, hint: null, allStacksEntered: true });

    const missedRebuy = endCheck(finishWith(played(), { a: "2000", s: "0" }), nameOf);
    expect(missedRebuy).toMatchObject({ ok: false, gap: -1500, hint: "Same as one $1,500 buy-in — missed rebuy?" });

    const over = endCheck(finishWith(played(), { a: "4000", s: "0" }), nameOf);
    expect(over).toMatchObject({ ok: false, gap: 500 });
  });

  it("blocks on a blank or non-whole stack", () => {
    const check = endCheck(finishWith(played(), { a: "3500", s: "" }), nameOf);
    expect(check.ok).toBe(false);
    expect(check.allStacksEntered).toBe(false);
    expect(check.blockers).toEqual(["Enter Shreyas's final stack (whole dollars, 0 is fine)."]);
    expect(endCheck(finishWith(played(), { a: "3499.5", s: "1" }), nameOf).ok).toBe(false);
  });

  it("blocks when a player has no buy-in, even if the totals match", () => {
    let g = start();
    g = addBuyIn(g, "a", 1000, NOW);
    const check = endCheck(finishWith(g, { a: "1000", s: "0" }), nameOf);
    expect(check.ok).toBe(false);
    expect(check.blockers[0]).toMatch(/Shreyas has no buy-in/);
  });

  it("finishLocalGame refuses anything that fails, and builds a valid game when it passes", () => {
    expect(() => finishLocalGame(finishWith(played(), { a: "1", s: "0" }), nameOf)).toThrow();
    const { game } = finishLocalGame(finishWith(played(), { a: "3500", s: "0" }), nameOf);
    expect(game).toMatchObject({ id: "G1", mode: "season", status: "finished", players: ["a", "s"] });
    expect(game.cashOuts).toEqual([
      { player: "a", amount: 3500 },
      { player: "s", amount: 0 },
    ]);
  });
});

describe("finishGameChange (one commit)", () => {
  function entryFor(g: LocalGame, stacks: Record<string, string>) {
    return finishLocalGame(finishWith(g, stacks), nameOf);
  }

  it("writes the game and clears its live marker in one change, passing validation", () => {
    let g = start();
    g = addBuyIn(addBuyIn(g, "a", 1000, NOW), "s", 1000, NOW);
    const data = makeData({ liveGame: { gameId: "G1", startedAt: NOW } });
    const next = finishGameChange(entryFor(g, { a: "500", s: "1500" }))(data);
    expect(next.games.map((x) => x.id)).toEqual(["G1"]);
    expect(next.liveGame).toBeNull();
    expect(() => validateData(next)).not.toThrow();
  });

  it("leaves someone else's marker alone", () => {
    let g = start();
    g = addBuyIn(addBuyIn(g, "a", 1000, NOW), "s", 1000, NOW);
    const other = { gameId: "OTHER", startedAt: NOW };
    const next = finishGameChange(entryFor(g, { a: "1000", s: "1000" }))(makeData({ liveGame: other }));
    expect(next.liveGame).toEqual(other);
  });

  it("duplicate guard: returns the same object when the game id is already saved", () => {
    let g = start();
    g = addBuyIn(addBuyIn(g, "a", 1000, NOW), "s", 1000, NOW);
    const change = finishGameChange(entryFor(g, { a: "1000", s: "1000" }));
    const once = change(makeData());
    expect(change(once)).toBe(once);
  });

  it("promotes the chosen guests in the same change, so the season game validates", () => {
    let g = start(undefined, { playerIds: ["a", "r"], guestChoice: "promote" });
    g = addBuyIn(addBuyIn(g, "a", 1000, NOW), "r", 1000, NOW);
    const next = finishGameChange(entryFor(g, { a: "0", r: "2000" }))(makeData());
    expect(next.players.find((p) => p.id === "r")?.type).toBe("regular");
    expect(next.players.find((p) => p.id === "g")?.type).toBe("guest");
    expect(() => validateData(next)).not.toThrow();
  });

  it("keep incognito: guests stay guests and the game is incognito", () => {
    let g = start(undefined, { playerIds: ["a", "r"], guestChoice: "incognito" });
    g = addBuyIn(addBuyIn(g, "a", 1000, NOW), "r", 1000, NOW);
    const next = finishGameChange(entryFor(g, { a: "0", r: "2000" }))(makeData());
    expect(next.games[0]?.mode).toBe("incognito");
    expect(next.players.find((p) => p.id === "r")?.type).toBe("guest");
    expect(() => validateData(next)).not.toThrow();
  });
});

describe("live marker changes", () => {
  it("start: sets the marker, is a no-op if already set for this game, refuses another game's", () => {
    const set = startMarkerChange("G1", NOW)(makeData());
    expect(set.liveGame).toEqual({ gameId: "G1", startedAt: NOW });
    expect(() => validateData(set)).not.toThrow();
    expect(startMarkerChange("G1", NOW)(set)).toBe(set);
    expect(() => startMarkerChange("G2", NOW)(set)).toThrow(/already in progress/);
  });

  it("clear: only clears the marker the admin saw", () => {
    const set = makeData({ liveGame: { gameId: "G1", startedAt: NOW } });
    expect(clearMarkerChange("G1")(set).liveGame).toBeNull();
    expect(clearMarkerChange("G2")(set)).toBe(set);
  });
});

describe("lastGamePlayers", () => {
  const game = (id: string, date: string, players: string[], status: Game["status"] = "finished"): Game => ({
    id,
    seasonId: "s1",
    date,
    mode: "incognito",
    status,
    players,
    buyIns: [],
    cashOuts: [],
    createdAt: NOW,
  });

  it("uses the newest finished game, skipping deleted games and archived players", () => {
    const data = makeData({
      games: [game("1", "2026-10-20", ["a", "s"]), game("2", "2026-10-22", ["a", "x", "r"]), game("3", "2026-10-23", ["s"], "deleted")],
    });
    expect(lastGamePlayers(data)).toEqual(["a", "r"]);
    expect(lastGamePlayers(makeData())).toEqual([]);
  });
});
