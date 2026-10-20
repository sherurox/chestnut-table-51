import { describe, expect, it } from "vitest";
import {
  endSeason,
  nextSeasonName,
  renameSeason,
  renameSeasonError,
  seasonActionBlock,
  seasonNameError,
  seasonStartError,
  startNewSeason,
} from "./adminOps.js";
import { endedSeasonMessage, renamedSeasonMessage, startedSeasonMessage } from "./commitMessages.js";
import { newId } from "./ids.js";
import { startGame } from "./liveGame.js";
import { migrate } from "./migrations.js";
import { champion, seasonStandings } from "./standings.js";
import type { Data, Game, Player } from "./types.js";
import { crownLine } from "../lib/seasonText.js";

// Season management (CLAUDE.md §5.2): End season, Start new season, Rename season.
// In season1(), Amit and Shreyas tie on +$500 and 2 games: the name tiebreak makes Amit #1.

const NOW = "2026-10-19T20:00:00.000Z";
const TODAY = "2026-10-20";

const player = (id: string, name: string): Player => ({ id, name, type: "regular", status: "active", createdAt: NOW });

function game(id: string, date: string, results: Record<string, [buyIn: number, cashOut: number]>, seasonId = "s1"): Game {
  const players = Object.keys(results);
  return {
    id,
    seasonId,
    date,
    mode: "season",
    status: "finished",
    players,
    buyIns: players.map((p) => ({ player: p, amount: results[p]![0], at: NOW })),
    cashOuts: players.map((p) => ({ player: p, amount: results[p]![1] })),
    createdAt: NOW,
  };
}

function season1(): Data {
  return migrate({
    version: 1,
    settings: { presetBuyIns: [1000, 1500, 2000] },
    players: [player("am", "Amit"), player("ro", "Rohan"), player("sh", "Shreyas")],
    seasons: [{ id: "s1", name: "Season 1", status: "active", startedOn: "2026-10-15" }],
    games: [
      game("g1", "2026-10-15", { am: [1000, 2500], ro: [1000, 0], sh: [1000, 500] }),
      game("g2", "2026-10-17", { am: [1000, 0], sh: [1000, 2000] }),
    ],
    liveGame: null,
  });
}

const start2 = (overrides: Partial<Parameters<typeof startNewSeason>[0]> = {}) =>
  startNewSeason({ id: "s2", name: "Season 2", startedOn: TODAY, today: TODAY, ...overrides });

describe("endSeason", () => {
  it("closes the active season with endedOn = today, keeping its standings and champion", () => {
    const before = season1();
    const after = migrate(endSeason({ today: TODAY })(before));
    expect(after.seasons).toEqual([{ id: "s1", name: "Season 1", status: "closed", startedOn: "2026-10-15", endedOn: TODAY }]);
    expect(seasonStandings(after, "s1")).toEqual(seasonStandings(before, "s1"));
    expect(champion(after, "s1")).toBe("am");
    expect(after.games).toEqual(before.games);
  });

  it("leaves no active season, and then no game of either mode can start", () => {
    const after = endSeason({ today: TODAY })(season1());
    expect(after.seasons.some((s) => s.status === "active")).toBe(false);
    for (const mode of ["season", "incognito"] as const) {
      expect(() =>
        startGame(after, { id: "x", playerIds: ["am", "ro"], mode, date: TODAY, now: NOW, guestChoice: null }),
      ).toThrow("Start a new season first.");
    }
  });

  it("is blocked while a live game marker exists, and when nothing is active", () => {
    const live = { ...season1(), liveGame: { gameId: "live1", startedAt: NOW } };
    expect(() => endSeason({ today: TODAY })(live)).toThrow(/in progress/);
    const ended = endSeason({ today: TODAY })(season1());
    expect(() => endSeason({ today: TODAY })(ended)).toThrow(/no active season/);
  });
});

describe("startNewSeason", () => {
  it("closes the active season and opens the new one in one change; everyone starts at $0", () => {
    const before = season1();
    const after = migrate(start2()(before));
    expect(after.seasons).toEqual([
      { id: "s1", name: "Season 1", status: "closed", startedOn: "2026-10-15", endedOn: TODAY },
      { id: "s2", name: "Season 2", status: "active", startedOn: TODAY },
    ]);
    // New season: nobody has played, so active regulars all show $0 and there's no champion yet.
    expect(seasonStandings(after, "s2").map((r) => [r.name, r.net, r.gamesPlayed])).toEqual([
      ["Amit", 0, 0],
      ["Rohan", 0, 0],
      ["Shreyas", 0, 0],
    ]);
    expect(champion(after, "s2")).toBeNull();
    // The closed season is untouched.
    expect(seasonStandings(after, "s1")).toEqual(seasonStandings(before, "s1"));
    expect(champion(after, "s1")).toBe("am");
  });

  it("after End season, just creates the new season", () => {
    const ended = endSeason({ today: "2026-10-19" })(season1());
    const after = migrate(start2()(ended));
    expect(after.seasons.find((s) => s.id === "s1")?.endedOn).toBe("2026-10-19");
    expect(after.seasons.filter((s) => s.status === "active").map((s) => s.id)).toEqual(["s2"]);
    expect(() => startGame(after, { id: "x", playerIds: ["am", "ro"], mode: "season", date: TODAY, now: NOW, guestChoice: null })).not.toThrow();
  });

  it("new games go to the new season only", () => {
    const after = start2()(season1());
    expect(startGame(after, { id: "x", playerIds: ["am", "ro"], mode: "incognito", date: TODAY, now: NOW, guestChoice: null }).seasonId).toBe("s2");
  });

  it("is blocked while a live game marker exists", () => {
    const live = { ...season1(), liveGame: { gameId: "live1", startedAt: NOW } };
    expect(() => start2()(live)).toThrow(/in progress/);
  });

  it("validates name, id and start date", () => {
    expect(() => start2({ name: "  " })(season1())).toThrow(/empty/);
    expect(() => start2({ name: " season 1 " })(season1())).toThrow(/already a season named Season 1/);
    expect(() => start2({ id: "s1" })(season1())).toThrow(/id already in use/);
    expect(() => start2({ startedOn: "2026-10-21" })(season1())).toThrow(/future/);
    expect(() => start2({ startedOn: "2026-10-14" })(season1())).toThrow(/before the last one/);
    expect(() => start2({ startedOn: "20/10/2026" })(season1())).toThrow(/valid start date/);
    expect(start2({ name: "  Monsoon  ", startedOn: "2026-10-15" })(season1()).seasons.at(-1)).toMatchObject({
      name: "Monsoon",
      startedOn: "2026-10-15",
    });
  });

  it("new seasons get fresh random ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newId()));
    expect(ids.size).toBe(50);
    let data = season1();
    for (const name of ["Season 2", "Season 3"]) {
      data = migrate(startNewSeason({ id: newId(), name, startedOn: TODAY, today: TODAY })(data));
    }
    expect(new Set(data.seasons.map((s) => s.id)).size).toBe(3);
    expect(data.seasons.slice(1).every((s) => /^[A-Za-z0-9_-]{8}$/.test(s.id))).toBe(true);
  });
});

describe("nextSeasonName", () => {
  it("is Season N+1, skipping names already taken", () => {
    expect(nextSeasonName(season1())).toBe("Season 2");
    const renamed = { ...season1(), seasons: [...season1().seasons, { id: "s2", name: "season 3", status: "closed" as const, startedOn: TODAY }] };
    expect(nextSeasonName(renamed)).toBe("Season 4");
    expect(nextSeasonName({ ...season1(), seasons: [] })).toBe("Season 1");
  });
});

describe("renameSeason", () => {
  it("changes the name only, for any season", () => {
    const closed = start2()(season1());
    const next = migrate(renameSeason("s1", " Diwali Cup ")(closed));
    expect(next.seasons[0]).toEqual({ ...closed.seasons[0], name: "Diwali Cup" });
    expect(champion(next, "s1")).toBe("am");
  });

  it("rejects empty, unchanged, duplicate (case-insensitive) and unknown", () => {
    const two = start2()(season1());
    expect(() => renameSeason("s1", " ")(two)).toThrow(/empty/);
    expect(() => renameSeason("s1", "Season 1")(two)).toThrow(/already its name/);
    expect(() => renameSeason("s1", "SEASON 2")(two)).toThrow(/already a season named Season 2/);
    expect(() => renameSeason("nope", "X")(two)).toThrow(/not found/);
    expect(renameSeason("s1", "SEASON 1")(two).seasons[0]?.name).toBe("SEASON 1");
  });
});

describe("seasonActionBlock (this phone)", () => {
  it("blocks while a game runs on this phone, a live marker exists, or games are unsynced", () => {
    const data = season1();
    expect(seasonActionBlock({ data, hasLocalGame: false, queued: 0 })).toBeNull();
    expect(seasonActionBlock({ data, hasLocalGame: true, queued: 0 })).toMatch(/running on this phone/);
    expect(seasonActionBlock({ data: { ...data, liveGame: { gameId: "x", startedAt: NOW } }, hasLocalGame: false, queued: 0 })).toMatch(
      /in progress/,
    );
    expect(seasonActionBlock({ data, hasLocalGame: false, queued: 1 })).toBe("This phone has 1 unsynced game. Sync it first.");
    expect(seasonActionBlock({ data, hasLocalGame: false, queued: 2 })).toBe("This phone has 2 unsynced games. Sync them first.");
  });
});

describe("crownLine (confirm dialog)", () => {
  it("names the current #1, or says there's no champion", () => {
    const data = season1();
    expect(crownLine(data, data.seasons[0]!)).toBe("Amit (+$500) will be crowned Season 1 champion.");
    const empty = { ...data, games: [] };
    expect(crownLine(empty, data.seasons[0]!)).toBe("No season games were played in Season 1, so there's no champion.");
  });
});

describe("season commit messages (§8.4)", () => {
  it("matches the agreed wording", () => {
    expect(endedSeasonMessage("Season 1")).toBe("Admin: ended Season 1");
    expect(startedSeasonMessage("Season 2", "Season 1")).toBe("Admin: started Season 2 (closed Season 1)");
    expect(startedSeasonMessage("Season 2")).toBe("Admin: started Season 2");
    expect(renamedSeasonMessage("Season 1", "Diwali Cup")).toBe("Admin: renamed season Season 1 to Diwali Cup");
  });
});

describe("inline field checks (shown before any confirm, same rules as the ops)", () => {
  it("seasonNameError", () => {
    const data = season1();
    expect(seasonNameError(data, "Season 2")).toBeNull();
    expect(seasonNameError(data, "   ")).toBe("Name can't be empty.");
    expect(seasonNameError(data, " SEASON 1 ")).toBe("There's already a season named Season 1.");
    expect(seasonNameError(data, "Season 1", "s1")).toBeNull(); // its own name, when renaming
  });

  it("seasonStartError", () => {
    const data = season1();
    expect(seasonStartError(data, TODAY, TODAY)).toBeNull();
    expect(seasonStartError(data, "2026-10-15", TODAY)).toBeNull();
    expect(seasonStartError(data, "", TODAY)).toBe("Pick a valid start date.");
    expect(seasonStartError(data, "2026-10-21", TODAY)).toBe("The start date can't be in the future.");
    expect(seasonStartError(data, "2026-10-14", TODAY)).toBe("The new season can't start before the last one did.");
  });

  it("renameSeasonError", () => {
    const two = start2()(season1());
    expect(renameSeasonError(two, "s1", "Diwali Cup")).toBeNull();
    expect(renameSeasonError(two, "s1", " Season 1 ")).toBe("That's already its name.");
    expect(renameSeasonError(two, "s1", "season 2")).toBe("There's already a season named Season 2.");
    expect(renameSeasonError(two, "s1", "")).toBe("Name can't be empty.");
    expect(renameSeasonError(two, "nope", "X")).toBe("Season not found.");
  });

  it("an input the checks accept is accepted by the op, and one they reject is rejected with the same message", () => {
    const data = season1();
    for (const [name, startedOn] of [["Season 2", TODAY], ["season 1", TODAY], ["Season 2", "2026-10-21"], [" ", TODAY]] as const) {
      const error = seasonNameError(data, name) ?? seasonStartError(data, startedOn, TODAY);
      const run = () => start2({ name, startedOn })(data);
      if (error) expect(run).toThrow(error);
      else expect(run).not.toThrow();
    }
  });
});
