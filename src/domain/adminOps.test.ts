import { describe, expect, it } from "vitest";
import {
  addPlayer,
  archivePlayer,
  createFirstSeason,
  presetBuyInsError,
  promoteGuest,
  renamePlayer,
  setPresetBuyIns,
  unarchivePlayer,
} from "./adminOps.js";
import { migrate } from "./migrations.js";
import type { Data, Player } from "./types.js";

const NOW = "2026-10-19T20:00:00.000Z";

function player(overrides: Partial<Player>): Player {
  return { id: "p1", name: "Alice", type: "regular", status: "active", createdAt: NOW, ...overrides };
}

function baseData(overrides: Partial<Data> = {}): Data {
  return {
    version: 1,
    settings: { presetBuyIns: [1000, 1500, 2000] },
    players: [
      player({ id: "p1", name: "Alice" }),
      player({ id: "p2", name: "Rohan", type: "guest" }),
      player({ id: "p3", name: "Old Timer", status: "archived" }),
    ],
    seasons: [{ id: "s1", name: "Season 1", status: "active", startedOn: "2026-10-01" }],
    games: [],
    liveGame: null,
    ...overrides,
  };
}

describe("addPlayer", () => {
  it("adds an active player with trimmed name, and the result validates", () => {
    const next = addPlayer({ id: "p9", name: "  Amit  ", type: "regular", now: NOW })(baseData());
    expect(next.players.at(-1)).toEqual({ id: "p9", name: "Amit", type: "regular", status: "active", createdAt: NOW });
    expect(() => migrate(next)).not.toThrow();
  });

  it("can add a guest", () => {
    const next = addPlayer({ id: "p9", name: "Zed", type: "guest", now: NOW })(baseData());
    expect(next.players.at(-1)?.type).toBe("guest");
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(() => addPlayer({ id: "p9", name: "   ", type: "regular", now: NOW })(baseData())).toThrow(/empty/);
  });

  it("rejects a duplicate name case-insensitively and after trimming", () => {
    expect(() => addPlayer({ id: "p9", name: " aLiCe ", type: "regular", now: NOW })(baseData())).toThrow(
      /already a player named Alice/,
    );
  });

  it("rejects a name used by an archived player", () => {
    expect(() => addPlayer({ id: "p9", name: "old timer", type: "regular", now: NOW })(baseData())).toThrow(
      /Old Timer/,
    );
  });

  it("rejects a reused id", () => {
    expect(() => addPlayer({ id: "p1", name: "New", type: "regular", now: NOW })(baseData())).toThrow(/id/);
  });

  it("does not mutate its input", () => {
    const data = baseData();
    addPlayer({ id: "p9", name: "Amit", type: "regular", now: NOW })(data);
    expect(data.players).toHaveLength(3);
  });
});

describe("renamePlayer", () => {
  it("renames, keeping the id", () => {
    const next = renamePlayer("p1", " Alicia ")(baseData());
    expect(next.players.find((p) => p.id === "p1")?.name).toBe("Alicia");
    expect(() => migrate(next)).not.toThrow();
  });

  it("allows a case-only change of the player's own name", () => {
    const next = renamePlayer("p1", "ALICE")(baseData());
    expect(next.players.find((p) => p.id === "p1")?.name).toBe("ALICE");
  });

  it("rejects an unchanged name", () => {
    expect(() => renamePlayer("p1", "Alice")(baseData())).toThrow(/already their name/);
  });

  it("rejects another player's name, including archived", () => {
    expect(() => renamePlayer("p1", "rohan")(baseData())).toThrow(/Rohan/);
    expect(() => renamePlayer("p1", "OLD TIMER")(baseData())).toThrow(/Old Timer/);
  });

  it("rejects an unknown player", () => {
    expect(() => renamePlayer("nope", "X")(baseData())).toThrow(/not found/);
  });
});

describe("archive / unarchive", () => {
  it("archives an active player and unarchives an archived one", () => {
    expect(archivePlayer("p1")(baseData()).players.find((p) => p.id === "p1")?.status).toBe("archived");
    expect(unarchivePlayer("p3")(baseData()).players.find((p) => p.id === "p3")?.status).toBe("active");
  });

  it("rejects no-op archive / unarchive", () => {
    expect(() => archivePlayer("p3")(baseData())).toThrow(/already archived/);
    expect(() => unarchivePlayer("p1")(baseData())).toThrow(/already active/);
  });
});

describe("promoteGuest", () => {
  it("promotes a guest to regular", () => {
    expect(promoteGuest("p2")(baseData()).players.find((p) => p.id === "p2")?.type).toBe("regular");
  });

  it("rejects promoting a regular", () => {
    expect(() => promoteGuest("p1")(baseData())).toThrow(/Only guests/);
  });
});

describe("setPresetBuyIns", () => {
  it("saves sorted ascending, and the result validates", () => {
    const next = setPresetBuyIns([2000, 500, 1000])(baseData());
    expect(next.settings.presetBuyIns).toEqual([500, 1000, 2000]);
    expect(() => migrate(next)).not.toThrow();
  });

  it("accepts the $5 and 10,000,000 bounds", () => {
    expect(setPresetBuyIns([5, 10_000_000])(baseData()).settings.presetBuyIns).toEqual([5, 10_000_000]);
  });

  it("presets must be multiples of $5, the smallest chip (the schema doesn't require it)", () => {
    expect(presetBuyInsError([1000, 1500, 2000])).toBeNull();
    expect(presetBuyInsError([1000, 1234])).toBe("Each preset must be one the chips can make. Use a multiple of $5.");
    expect(() => setPresetBuyIns([1])(baseData())).toThrow(/multiple of \$5/);
  });

  it.each([
    [[], /at least one/],
    [[1, 2, 3, 4, 5, 6, 7], /At most 6/],
    [[0], /whole dollar/],
    [[10_000_001], /whole dollar/],
    [[12.5], /whole dollar/],
    [[-5], /whole dollar/],
    [[1000, 1000], /different/],
  ])("rejects %j", (amounts, message) => {
    expect(presetBuyInsError(amounts)).toMatch(message);
    expect(() => setPresetBuyIns(amounts)(baseData())).toThrow(message);
  });
});

describe("createFirstSeason", () => {
  it("creates an active Season 1 when there are no seasons", () => {
    const next = createFirstSeason({ id: "s9", today: "2026-10-19" })(baseData({ seasons: [] }));
    expect(next.seasons).toEqual([{ id: "s9", name: "Season 1", status: "active", startedOn: "2026-10-19" }]);
    expect(() => migrate(next)).not.toThrow();
  });

  it("refuses when a season already exists", () => {
    expect(() => createFirstSeason({ id: "s9", today: "2026-10-19" })(baseData())).toThrow(/already exists/);
  });
});
