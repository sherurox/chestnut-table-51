import { describe, expect, it } from "vitest";
import { MAX_SEASON_GAMES } from "../config.js";
import { seasonLimitAction, startSeasonFromSearch, START_SEASON_PATH } from "../lib/homeActions.js";
import { seasonCompleteLine, seasonProgress } from "../lib/seasonText.js";
import { statsPanelContent } from "../lib/statsPanel.js";
import { saveWith, type WriteBackend } from "../storage/githubWrite.js";
import { moveToQueue } from "../storage/localGame.js";
import { MemoryStore } from "../storage/__test__/memoryStore.js";
import { syncAll } from "../storage/sync.js";
import { endSeason } from "./adminOps.js";
import { finishedGameMessage } from "./commitMessages.js";
import { deleteGameChange, draftFromGame, editCheck, editGameChange, restoreGameChange } from "./gameEdits.js";
import { addBuyIn, finishGameChange, finishLocalGame, setFinalStack, startGame, type FinishedEntry } from "./liveGame.js";
import { migrate } from "./migrations.js";
import { seasonCompletedBy, seasonEndDate, seasonFullMessage, seasonGameCount, seasonIsFull } from "./seasonLimit.js";
import { champion } from "./standings.js";
import type { Data, Game, Player } from "./types.js";

// The 10-game season limit (CLAUDE.md §5.2, Table tools step D).

const NOW = "2026-10-24T21:00:00.000Z";
const NAMES: Record<string, string> = { a: "Amit", b: "Bina", c: "Chetan", g: "Rohan" };
const nameOf = (id: string) => NAMES[id] ?? id;

const player = (id: string, type: Player["type"] = "regular"): Player => ({ id, name: NAMES[id]!, type, status: "active", createdAt: NOW });

// Amit wins `win` from Bina.
function game(id: string, date: string, win: number, extra: Partial<Game> = {}): Game {
  return {
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
      { player: "a", amount: 1000 + win },
      { player: "b", amount: 1000 - win },
    ],
    createdAt: `${date}T19:00:00.000Z`,
    ...extra,
  };
}

const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}`;

// `count` finished season games in Season 1 (Oct 1, 2, …), Amit +100 each, plus noise that never counts.
function fixture(count: number, seasonExtra: Partial<Data["seasons"][number]> = {}): Data {
  return migrate({
    version: 1,
    settings: { presetBuyIns: [1000] },
    players: [player("a"), player("b"), player("c"), player("g", "guest")],
    seasons: [{ id: "s1", name: "Season 1", status: "active", startedOn: "2026-10-01", ...seasonExtra }],
    games: [
      ...Array.from({ length: count }, (_, i) => game(`g${i + 1}`, day(i + 1), 100)),
      game("inc", day(1), 300, { mode: "incognito" }),
      game("del", day(2), 50, { status: "deleted", deletedAt: NOW }),
    ],
    liveGame: null,
  });
}

// A finished live game: Chetan wins `win` from Bina (Bina never runs out of chips in these tests).
function liveEntry(data: Data, opts: { id?: string; date?: string; mode?: Game["mode"]; win?: number } = {}): FinishedEntry {
  let g = startGame(data, { id: opts.id ?? "new", playerIds: ["b", "c"], mode: opts.mode ?? "season", guestChoice: null, date: opts.date ?? day(20), now: NOW });
  const win = opts.win ?? 2000;
  g = addBuyIn(addBuyIn(g, "b", 3000, NOW), "c", 1000, NOW);
  g = setFinalStack(setFinalStack(g, "b", String(3000 - win)), "c", String(1000 + win));
  return finishLocalGame(g, nameOf);
}

// An in-memory data.json with a sha, like githubWrite.test's. `beforePut` runs once, before the first
// PUT is checked: another phone saving in between, so that PUT gets a 409.
function memoryBackend(initial: Data, beforePut?: (data: Data) => Data) {
  const state = { data: initial, sha: 0, messages: [] as string[] };
  let hook = beforePut;
  const backend: WriteBackend = {
    async fetchCurrent() {
      return { sha: `sha-${state.sha}`, data: structuredClone(state.data) };
    },
    async put(next, sha, message) {
      if (hook) {
        state.data = migrate(hook(state.data));
        state.sha++;
        hook = undefined;
      }
      if (sha !== `sha-${state.sha}`) return { ok: false, status: 409, message: "conflict" };
      state.data = next;
      state.sha++;
      state.messages.push(message);
      return { ok: true, commitSha: `c${state.sha}` };
    },
  };
  return { state, backend };
}

function season(data: Data) {
  return data.seasons.find((s) => s.id === "s1")!;
}

describe("season game count", () => {
  it("counts finished season games only: incognito and deleted games don't count", () => {
    const data = fixture(3);
    expect(data.games).toHaveLength(5);
    expect(seasonGameCount(data, "s1")).toBe(3);
    expect(seasonIsFull(data, "s1")).toBe(false);
    expect(MAX_SEASON_GAMES).toBe(10);
    expect(seasonIsFull(fixture(10), "s1")).toBe(true);
  });

  it("shows progress as Game N of 10", () => {
    expect(seasonProgress(fixture(8), "s1")).toBe("Game 8 of 10");
    expect(seasonProgress(fixture(0), "s1")).toBe("No games yet · 10 to play");
    expect(statsPanelContent(fixture(8), day(24))?.progress).toBe("Game 8 of 10");
  });
});

describe("finishing game 10", () => {
  it("closes the season in the same change, with endedOn and the champion including this game", () => {
    const data = { ...fixture(9), liveGame: { gameId: "new", startedAt: NOW } };
    // Amit leads with +900 before; Chetan's +2,000 tonight makes him champion.
    expect(champion(data, "s1")).toBe("a");
    const entry = liveEntry(data, { win: 2000 });
    const after = finishGameChange(entry)(data);

    expect(after.games.map((g) => g.id)).toContain("new");
    expect(after.liveGame).toBeNull();
    expect(season(after)).toEqual({ id: "s1", name: "Season 1", status: "closed", startedOn: "2026-10-01", endedOn: day(20) });
    expect(seasonGameCount(after, "s1")).toBe(10);
    expect(champion(after, "s1")).toBe("c");
    expect(seasonCompletedBy(data, after, "s1")).toBe(true);
    expect(() => migrate(after)).not.toThrow();
    expect(seasonCompleteLine(data, after, "s1")).toBe("This is game 10 of 10. Saving ends Season 1 and crowns Chetan (+$2,000).");
  });

  it("uses the latest game date for endedOn when game 10 is backdated", () => {
    const data = fixture(9); // latest game Oct 9
    const after = finishGameChange(liveEntry(data, { date: day(5) }))(data);
    expect(season(after)).toMatchObject({ status: "closed", endedOn: day(9) });
    expect(seasonEndDate(after, "s1")).toBe(day(9));
  });

  it("game 9, or an incognito game 10, leaves the season open", () => {
    const eight = fixture(8);
    const nine = finishGameChange(liveEntry(eight))(eight);
    expect(season(nine).status).toBe("active");
    expect(seasonCompleteLine(eight, nine, "s1")).toBeNull();

    const data = fixture(9);
    const after = finishGameChange(liveEntry(data, { mode: "incognito" }))(data);
    expect(season(after).status).toBe("active");
    expect(seasonGameCount(after, "s1")).toBe(9);
  });

  it("a retry after the save landed commits nothing (duplicate guard first)", () => {
    const data = fixture(9);
    const entry = liveEntry(data);
    const after = migrate(finishGameChange(entry)(data));
    expect(finishGameChange(entry)(after)).toBe(after);
  });
});

describe("starting game 11", () => {
  const full = fixture(10); // active and full: reached 10 by an edit or restore, or before the limit

  it("blocks a season game but allows incognito", () => {
    expect(() => liveEntry(full)).toThrow("Season 1 is complete: end it to crown the champion");
    expect(liveEntry(full, { mode: "incognito" }).game.mode).toBe("incognito");
  });

  it("blocks adding guests to the season, but keeping the game incognito is fine", () => {
    const input = { id: "x", playerIds: ["a", "g"], mode: "season" as const, date: day(20), now: NOW };
    expect(() => startGame(full, { ...input, guestChoice: "promote" })).toThrow(seasonFullMessage(season(full)));
    expect(startGame(full, { ...input, guestChoice: "incognito" }).startMode).toBe("incognito");
  });

  it("doesn't auto-close a season that already has 10 or more, and Home asks to end it", () => {
    expect(season(full).status).toBe("active");
    expect(seasonLimitAction(full)).toEqual({ kind: "full", text: "Season 1 is complete: end it to crown the champion" });
    expect(seasonLimitAction(fixture(9))).toBeNull();
  });
});

describe("after the auto-close", () => {
  it("Home's one button starts the next season, straight to a pre-filled confirm", () => {
    const data = fixture(9);
    const after = finishGameChange(liveEntry(data))(data);
    expect(seasonLimitAction(after)).toEqual({ kind: "ended", text: "Season 1 is complete: start Season 2" });
    expect(START_SEASON_PATH).toBe("/admin/seasons?start=1");
    expect(startSeasonFromSearch("?start=1")).toBe(true);
    expect(startSeasonFromSearch("")).toBe(false);
    // No active season: no game of either mode (§5.2).
    expect(() => liveEntry(after, { mode: "incognito" })).toThrow("Start a new season first.");
  });

  it("a season ended early by the admin keeps the ordinary 'Start a new season first'", () => {
    const data = endSeason({ today: day(24) })(fixture(4));
    expect(seasonLimitAction(data)).toBeNull();
  });
});

describe("queued games (offline, or another phone)", () => {
  async function sync(initial: Data, entries: FinishedEntry[]) {
    const mem = memoryBackend(initial);
    const store = new MemoryStore();
    for (const e of entries) moveToQueue(e, store);
    const report = await syncAll({ save: (change, message) => saveWith(mem.backend, change, message), store });
    return { mem, report };
  }

  it("game 10 from the queue closes the season, and the commit message says so", async () => {
    const data = fixture(9);
    const { mem, report } = await sync(data, [liveEntry(data)]);
    expect(report.error).toBeNull();
    expect(season(mem.state.data)).toMatchObject({ status: "closed", endedOn: day(20) });
    expect(mem.state.messages).toEqual(["Admin: finished game 2026-10-20 (Season 1, 2 players); Season 1 complete"]);
  });

  it("a game into a season that is already closed is saved, and the season stays closed", async () => {
    const closed = fixture(10, { status: "closed", endedOn: day(10) });
    const entry = liveEntry(fixture(9), { id: "late" }); // started on another phone while there was room
    const { mem, report } = await sync(closed, [entry]);
    expect(report.error).toBeNull();
    expect(mem.state.data.games.map((g) => g.id)).toContain("late");
    expect(seasonGameCount(mem.state.data, "s1")).toBe(11);
    expect(season(mem.state.data)).toEqual(season(closed));
    expect(mem.state.messages).toEqual(["Admin: finished game 2026-10-20 (Season 1, 2 players)"]);
  });

  it("a game into a full season that is still active is saved without closing it", async () => {
    const full = fixture(10);
    const { mem } = await sync(full, [liveEntry(fixture(9), { id: "late" })]);
    expect(seasonGameCount(mem.state.data, "s1")).toBe(11);
    expect(season(mem.state.data).status).toBe("active");
    expect(mem.state.messages[0]).not.toMatch(/complete/);
  });

  it("two queued games: the first closes the season, the second still saves into it", async () => {
    const data = fixture(9);
    const { mem } = await sync(data, [liveEntry(data, { id: "q1" }), liveEntry(data, { id: "q2", date: day(21) })]);
    expect(seasonGameCount(mem.state.data, "s1")).toBe(11);
    expect(season(mem.state.data)).toMatchObject({ status: "closed", endedOn: day(20) });
    expect(mem.state.messages.map((m) => m.endsWith("; Season 1 complete"))).toEqual([true, false]);
  });

  it("on a conflict, the message is rebuilt: another phone's game took slot 10 first", async () => {
    const data = fixture(9);
    const other = liveEntry(data, { id: "other" });
    const mine = liveEntry(data, { id: "mine", date: day(21) });
    const mem = memoryBackend(data, (d) => finishGameChange(other)(d));
    const store = new MemoryStore();
    moveToQueue(mine, store);
    await syncAll({ save: (change, message) => saveWith(mem.backend, change, message), store });
    expect(mem.state.data.games.map((g) => g.id)).toEqual(expect.arrayContaining(["other", "mine"]));
    expect(season(mem.state.data)).toMatchObject({ status: "closed", endedOn: day(20) });
    expect(mem.state.messages).toEqual(["Admin: finished game 2026-10-21 (Season 1, 2 players)"]);
  });
});

describe("commit message", () => {
  it("appends '; Season 1 complete' after any promotions", () => {
    const base = { date: "2026-10-26", mode: "season" as const, seasonName: "Season 1", playerCount: 5 };
    expect(finishedGameMessage({ ...base, promotedNames: [], seasonComplete: true })).toBe(
      "Admin: finished game 2026-10-26 (Season 1, 5 players); Season 1 complete",
    );
    expect(finishedGameMessage({ ...base, promotedNames: ["Rohan"], seasonComplete: true })).toBe(
      "Admin: finished game 2026-10-26 (Season 1, 5 players; promoted guest Rohan); Season 1 complete",
    );
    expect(finishedGameMessage({ ...base, promotedNames: [] })).toBe("Admin: finished game 2026-10-26 (Season 1, 5 players)");
  });
});

describe("edit, delete and restore", () => {
  const TODAY = day(24);

  it("blocks switching an incognito game to season mode when the season is full", () => {
    const data = fixture(10);
    const inc = data.games.find((g) => g.id === "inc")!;
    const check = editCheck(data, inc, { ...draftFromGame(inc), mode: "season" }, nameOf, TODAY, NOW);
    expect(check.ok).toBe(false);
    expect(check.blockers).toContain("Season 1 is full (10 of 10 games), so this game can't become a season game.");
    expect(() => editGameChange({ before: inc, after: check.game, promote: [] })(data)).toThrow(/is full/);
  });

  it("allows it at 9, reaching 10 without closing the season", () => {
    const data = fixture(9);
    const inc = data.games.find((g) => g.id === "inc")!;
    const check = editCheck(data, inc, { ...draftFromGame(inc), mode: "season" }, nameOf, TODAY, NOW);
    expect(check.ok).toBe(true);
    const after = editGameChange({ before: inc, after: check.game, promote: [] })(data);
    expect(seasonGameCount(after, "s1")).toBe(10);
    expect(season(after).status).toBe("active");
    expect(seasonLimitAction(after)?.kind).toBe("full");
  });

  it("still allows other edits to a game in a full season", () => {
    const data = fixture(10);
    const g1 = data.games.find((g) => g.id === "g1")!;
    const check = editCheck(data, g1, { ...draftFromGame(g1), date: day(3) }, nameOf, TODAY, NOW);
    expect(check.ok).toBe(true);
  });

  it("blocks a restore that would go past 10, in an active or a closed season", () => {
    expect(() => restoreGameChange("del")(fixture(10))).toThrow("Season 1 already has 10 of 10 games, so this game can't be restored.");
    expect(() => restoreGameChange("del")(fixture(10, { status: "closed", endedOn: day(10) }))).toThrow(/can't be restored/);
  });

  it("allows a restore that reaches exactly 10 and doesn't close the season", () => {
    const after = restoreGameChange("del")(fixture(9));
    expect(seasonGameCount(after, "s1")).toBe(10);
    expect(season(after).status).toBe("active");
  });

  it("restores a deleted incognito game into a full season (it doesn't count)", () => {
    const data = fixture(10);
    const withDeletedInc = { ...data, games: data.games.map((g) => (g.id === "inc" ? { ...g, status: "deleted" as const, deletedAt: NOW } : g)) };
    expect(restoreGameChange("inc")(withDeletedInc).games.find((g) => g.id === "inc")?.status).toBe("finished");
  });

  it("deleting a game from a closed season doesn't reopen it", () => {
    const data = fixture(10, { status: "closed", endedOn: day(10) });
    const after = deleteGameChange("g10", NOW)(data);
    expect(seasonGameCount(after, "s1")).toBe(9);
    expect(season(after)).toEqual(season(data));
  });
});
