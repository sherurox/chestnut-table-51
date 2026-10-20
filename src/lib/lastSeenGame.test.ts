import { describe, expect, it } from "vitest";
import { deleteGameChange, draftFromGame, editCheck, editGameChange, restoreGameChange } from "../domain/gameEdits.js";
import type { Data, Game } from "../domain/types.js";
import { checkNewGame, isLater, LAST_SEEN_GAME_KEY, latestSeasonGame, newGameDecision, SEEN_WATERMARK_KEY } from "./lastSeenGame.js";

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
    { player: "a", amount: 1000, at: `${date}T20:00:00.000Z` },
    { player: "b", amount: 1000, at: `${date}T20:00:00.000Z` },
  ],
  cashOuts: [
    { player: "a", amount: 1500 },
    { player: "b", amount: 500 },
  ],
  createdAt: `${date}T23:00:00.000Z`,
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

// What Home does on open, against the data it sees.
function opens(d: Data, store: ReturnType<typeof memoryStore>): boolean {
  return checkNewGame(latestSeasonGame(d, "s1"), store, (id) => d.games.find((g) => g.id === id)?.createdAt ?? null);
}

describe("latestSeasonGame", () => {
  it("is the most recently created finished season game; incognito and deleted games don't count", () => {
    const d = data([
      game("g1", "2026-10-01"),
      game("g2", "2026-10-03"),
      // Played on an earlier date but saved later: still the latest created.
      game("late", "2026-10-02", { createdAt: "2026-10-04T01:00:00.000Z" }),
      game("inc", "2026-10-05", { mode: "incognito" }),
      game("del", "2026-10-06", { status: "deleted" }),
    ]);
    expect(latestSeasonGame(d, "s1")?.id).toBe("late");
    expect(latestSeasonGame(data([]), "s1")).toBeNull();
  });

  it("compares createdAt as instants", () => {
    expect(isLater("2026-10-20T01:00:00.000Z", "2026-10-19T23:00:00Z")).toBe(true);
    expect(isLater("2026-10-19T23:00:00Z", "2026-10-19T23:00:00.000Z")).toBe(false);
  });
});

describe("newGameDecision / checkNewGame", () => {
  it("first ever visit: no celebration, just remember the watermark", () => {
    expect(newGameDecision(null, "T")).toEqual({ celebrate: false, store: "T" });
    const store = memoryStore();
    expect(opens(data([game("g1", "2026-10-01")]), store)).toBe(false);
    expect(store.map.get(SEEN_WATERMARK_KEY)).toBe("2026-10-01T23:00:00.000Z");
  });

  it("a genuinely new game celebrates once, then never again", () => {
    const store = memoryStore();
    opens(data([game("g1", "2026-10-01")]), store);
    const withNew = data([game("g1", "2026-10-01"), game("g2", "2026-10-02")]);
    expect(opens(withNew, store)).toBe(true);
    expect(store.map.get(SEEN_WATERMARK_KEY)).toBe("2026-10-02T23:00:00.000Z");
    expect(opens(withNew, store)).toBe(false);
  });

  it("no season games: nothing to remember; blocked storage never celebrates", () => {
    expect(newGameDecision(null, null)).toEqual({ celebrate: false, store: null });
    expect(newGameDecision("T", null)).toEqual({ celebrate: false, store: null });
    const blocked = {
      getItem: (): string | null => {
        throw new Error("blocked");
      },
      setItem: () => {},
    };
    expect(checkNewGame(game("g2", "2026-10-02"), blocked, () => null)).toBe(false);
    expect(checkNewGame(game("g2", "2026-10-02"), null, () => null)).toBe(false);
  });
});

describe("edits, deletes and restores never celebrate", () => {
  const NOW = "2026-10-20T10:00:00.000Z";
  const seen = () => {
    const d = data([game("g1", "2026-10-01"), game("g2", "2026-10-02"), game("g3", "2026-10-03")]);
    const store = memoryStore();
    opens(d, store); // this phone has seen all three
    return { d, store };
  };

  it("deleting the latest game: the previous one doesn't look new", () => {
    const { d, store } = seen();
    const after = deleteGameChange("g3", NOW)(d);
    expect(opens(after, store)).toBe(false);
    expect(store.map.get(SEEN_WATERMARK_KEY)).toBe("2026-10-03T23:00:00.000Z"); // never moves back
  });

  it("restoring a game (after a delete was seen) doesn't celebrate", () => {
    const { d, store } = seen();
    const deleted = deleteGameChange("g3", NOW)(d);
    expect(opens(deleted, store)).toBe(false);
    expect(opens(restoreGameChange("g3")(deleted), store)).toBe(false);
    const oldDeleted = deleteGameChange("g1", NOW)(d);
    expect(opens(restoreGameChange("g1")(oldDeleted), store)).toBe(false);
  });

  it("editing a game's date (even to the newest date) doesn't celebrate", () => {
    const { d, store } = seen();
    const g1 = d.games[0]!;
    const draft = { ...draftFromGame(g1), date: "2026-10-09" };
    const check = editCheck(d, g1, draft, (id) => id, "2026-10-20", NOW);
    expect(check.ok).toBe(true);
    const after = editGameChange({ before: g1, after: check.game, promote: [] })(d);
    expect(opens(after, store)).toBe(false);
  });

  it("a genuinely new game after all of that still celebrates", () => {
    const { d, store } = seen();
    const after = restoreGameChange("g3")(deleteGameChange("g3", NOW)(d));
    opens(after, store);
    const next = { ...after, games: [...after.games, game("g4", "2026-10-04", { createdAt: "2026-10-04T20:00:00.000Z" })] };
    expect(opens(next, store)).toBe(true);
  });
});

describe("migrating from ct51.lastSeenGame", () => {
  it("uses the old game's createdAt as the watermark and removes the old key", () => {
    const d = data([game("g1", "2026-10-01"), game("g2", "2026-10-02")]);
    const store = memoryStore({ [LAST_SEEN_GAME_KEY]: "g2" });
    expect(opens(d, store)).toBe(false);
    expect(store.map.has(LAST_SEEN_GAME_KEY)).toBe(false);
    expect(store.map.get(SEEN_WATERMARK_KEY)).toBe("2026-10-02T23:00:00.000Z");
  });

  it("a game newer than the old key still celebrates on the first open after the update", () => {
    const d = data([game("g1", "2026-10-01"), game("g2", "2026-10-02")]);
    const store = memoryStore({ [LAST_SEEN_GAME_KEY]: "g1" });
    expect(opens(d, store)).toBe(true);
    expect(store.map.has(LAST_SEEN_GAME_KEY)).toBe(false);
  });

  it("an old key whose game is gone (wiped test data) is forgotten: acts like a first visit", () => {
    const d = data([game("Qw7_kLm2", "2026-10-21")]);
    const store = memoryStore({ [LAST_SEEN_GAME_KEY]: "g9" });
    expect(opens(d, store)).toBe(false);
    expect(store.map.has(LAST_SEEN_GAME_KEY)).toBe(false);
    expect(store.map.get(SEEN_WATERMARK_KEY)).toBe("2026-10-21T23:00:00.000Z");
  });

  it("with both keys, the watermark wins and the old key is dropped", () => {
    const d = data([game("g1", "2026-10-01"), game("g2", "2026-10-02")]);
    const store = memoryStore({ [LAST_SEEN_GAME_KEY]: "g1", [SEEN_WATERMARK_KEY]: "2026-10-02T23:00:00.000Z" });
    expect(opens(d, store)).toBe(false);
    expect(store.map.has(LAST_SEEN_GAME_KEY)).toBe(false);
  });
});
