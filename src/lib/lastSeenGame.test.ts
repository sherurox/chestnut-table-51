import { describe, expect, it } from "vitest";
import type { Data, Game } from "../domain/types.js";
import { checkLastSeenGame, LAST_SEEN_GAME_KEY, lastSeenDecision, latestSeasonGameId } from "./lastSeenGame.js";

function memoryStore(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map,
  };
}

const game = (id: string, date: string, extra: Partial<Game> = {}): Game => ({
  id,
  seasonId: "s1",
  date,
  mode: "season",
  status: "finished",
  players: ["a", "b"],
  buyIns: [
    { player: "a", amount: 1000, at: `${date}T20:00:00Z` },
    { player: "b", amount: 1000, at: `${date}T20:00:00Z` },
  ],
  cashOuts: [
    { player: "a", amount: 1500 },
    { player: "b", amount: 500 },
  ],
  createdAt: `${date}T23:00:00Z`,
  ...extra,
});

const data = (games: Game[]): Data => ({
  version: 1,
  settings: { presetBuyIns: [1000] },
  players: [
    { id: "a", name: "A", type: "regular", status: "active", createdAt: "2026-01-01T00:00:00Z" },
    { id: "b", name: "B", type: "regular", status: "active", createdAt: "2026-01-01T00:00:00Z" },
  ],
  seasons: [{ id: "s1", name: "Season 1", status: "active", startedOn: "2026-01-01" }],
  games,
  liveGame: null,
});

describe("latestSeasonGameId", () => {
  it("is the newest finished season game; incognito and deleted games don't count", () => {
    const d = data([
      game("g1", "2026-10-01"),
      game("g2", "2026-10-03"),
      game("inc", "2026-10-05", { mode: "incognito" }),
      game("del", "2026-10-06", { status: "deleted" }),
    ]);
    expect(latestSeasonGameId(d, "s1")).toBe("g2");
    expect(latestSeasonGameId(data([]), "s1")).toBeNull();
  });
});

describe("lastSeenGame", () => {
  it("first ever visit: no pulse, just remember the game", () => {
    expect(lastSeenDecision(null, "g2")).toEqual({ pulse: false, store: "g2" });
    const store = memoryStore();
    expect(checkLastSeenGame("g2", store)).toBe(false);
    expect(store.map.get(LAST_SEEN_GAME_KEY)).toBe("g2");
  });

  it("same game as last time: no pulse", () => {
    expect(lastSeenDecision("g2", "g2")).toEqual({ pulse: false, store: null });
    const store = memoryStore({ [LAST_SEEN_GAME_KEY]: "g2" });
    expect(checkLastSeenGame("g2", store)).toBe(false);
    expect(checkLastSeenGame("g2", store)).toBe(false);
  });

  it("a new game: pulse once, then remember it so it never pulses again", () => {
    const store = memoryStore({ [LAST_SEEN_GAME_KEY]: "g1" });
    expect(checkLastSeenGame("g2", store)).toBe(true);
    expect(store.map.get(LAST_SEEN_GAME_KEY)).toBe("g2");
    expect(checkLastSeenGame("g2", store)).toBe(false);
  });

  it("no season games yet: nothing to remember or pulse; blocked storage never pulses", () => {
    expect(lastSeenDecision(null, null)).toEqual({ pulse: false, store: null });
    expect(lastSeenDecision("g1", null)).toEqual({ pulse: false, store: null });
    const blocked = {
      getItem: (): string | null => {
        throw new Error("blocked");
      },
      setItem: () => {},
    };
    expect(checkLastSeenGame("g2", blocked)).toBe(false);
    expect(checkLastSeenGame("g2", null)).toBe(false);
  });

  it("a stored game that no longer exists (test data wiped) is forgotten: the next game doesn't pulse", () => {
    const wiped = data([]);
    const isGame = (id: string) => wiped.games.some((g) => g.id === id);
    const store = memoryStore({ [LAST_SEEN_GAME_KEY]: "g9" });
    expect(checkLastSeenGame(null, store, isGame)).toBe(false);
    expect(store.map.has(LAST_SEEN_GAME_KEY)).toBe(false);

    const first = data([game("Qw7_kLm2", "2026-10-21")]);
    expect(checkLastSeenGame("Qw7_kLm2", store, (id) => first.games.some((g) => g.id === id))).toBe(false);
    expect(store.map.get(LAST_SEEN_GAME_KEY)).toBe("Qw7_kLm2");
  });

  it("a stored game that still exists (even deleted) is kept and still pulses for a newer game", () => {
    const d = data([game("g1", "2026-10-01", { status: "deleted" }), game("g2", "2026-10-03")]);
    const store = memoryStore({ [LAST_SEEN_GAME_KEY]: "g1" });
    expect(checkLastSeenGame("g2", store, (id) => d.games.some((g) => g.id === id))).toBe(true);
  });
});
