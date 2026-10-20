import { describe, expect, it } from "vitest";
import { seasonActionBlock } from "./adminOps.js";
import { netWinningsOverTime } from "./charts.js";
import { deletedGameMessage, editedGameMessage, restoredGameMessage } from "./commitMessages.js";
import { badges, playerSeasonStats, seasonAwards, seasonSummary } from "./fun.js";
import {
  deleteGameChange,
  deletedGames,
  draftFromGame,
  editCheck,
  editGameChange,
  restoreGameChange,
  type GameDraft,
} from "./gameEdits.js";
import { latestFinishedGame, rankChanges } from "./highlights.js";
import { lastGamePlayers } from "./liveGame.js";
import { migrate } from "./migrations.js";
import { champion, seasonStandings } from "./standings.js";
import type { Data, Game, Player } from "./types.js";
import { saveWith, type WriteBackend } from "../storage/githubWrite.js";
import { visibleGames } from "../lib/selectors.js";
import { statsPanelContent } from "../lib/statsPanel.js";

// Editing, deleting and restoring games (CLAUDE.md §5.9).
// s1 is closed (Oct 1–10), s2 is active (since Oct 11). Rohan ("gu") is still a guest.

const NOW = "2026-10-20T12:00:00.000Z";
const TODAY = "2026-10-20";

const player = (id: string, name: string, type: Player["type"] = "regular"): Player => ({ id, name, type, status: "active", createdAt: NOW });

function game(id: string, seasonId: string, date: string, results: Record<string, [buyIn: number, cashOut: number]>, mode: Game["mode"] = "season"): Game {
  const players = Object.keys(results);
  return {
    id,
    seasonId,
    date,
    mode,
    status: "finished",
    players,
    buyIns: players.map((p) => ({ player: p, amount: results[p]![0], at: `${date}T20:00:00.000Z` })),
    cashOuts: players.map((p) => ({ player: p, amount: results[p]![1] })),
    createdAt: `${date}T19:00:00.000Z`,
  };
}

function fixture(): Data {
  return migrate({
    version: 1,
    settings: { presetBuyIns: [1000, 1500, 2000] },
    players: [player("am", "Amit"), player("sh", "Shreyas"), player("vi", "Vik"), player("gu", "Rohan", "guest")],
    seasons: [
      { id: "s1", name: "Season 1", status: "closed", startedOn: "2026-10-01", endedOn: "2026-10-10" },
      { id: "s2", name: "Season 2", status: "active", startedOn: "2026-10-11" },
    ],
    games: [
      // Season 1: Amit +500, Shreyas +200, Vik −700. Amit is champion.
      game("a1", "s1", "2026-10-02", { am: [1000, 1500], sh: [1000, 1200], vi: [1000, 300] }),
      // Season 2
      game("b1", "s2", "2026-10-12", { am: [1000, 400], sh: [1000, 1600] }),
      game("b2", "s2", "2026-10-14", { am: [1000, 1800], sh: [1000, 700], vi: [1000, 500] }),
      game("b3", "s2", "2026-10-15", { am: [1000, 500], gu: [1000, 1500] }, "incognito"),
    ],
    liveGame: null,
  });
}

const names: Record<string, string> = { am: "Amit", sh: "Shreyas", vi: "Vik", gu: "Rohan" };
const nameOf = (id: string) => names[id] ?? id;
const g = (d: Data, id: string) => d.games.find((x) => x.id === id)!;
const net = (d: Data, seasonId: string) => Object.fromEntries(seasonStandings(d, seasonId).map((r) => [r.playerId, r.net]));
const check = (d: Data, original: Game, draft: GameDraft) => editCheck(d, original, draft, nameOf, TODAY, NOW);

// Apply a draft as the edit screen would: check, then the change, then migrate + validation.
function applyEdit(d: Data, id: string, edit: (draft: GameDraft) => GameDraft): Data {
  const before = g(d, id);
  const c = check(d, before, edit(draftFromGame(before)));
  if (!c.ok) throw new Error(c.blockers[0] ?? `chip check: gap ${c.gap}`);
  return migrate(editGameChange({ before, after: c.game, promote: c.promote })(d));
}

const setStacks = (stacks: Record<string, string>) => (draft: GameDraft) => ({ ...draft, stacks: { ...draft.stacks, ...stacks } });

describe("editing a game", () => {
  it("changes standings correctly and sets editedAt", () => {
    const d = fixture();
    expect(net(d, "s2")).toEqual({ am: 200, sh: 300, vi: -500 });
    const after = applyEdit(d, "b2", setStacks({ am: "1300", sh: "1200" }));
    expect(net(after, "s2")).toEqual({ am: -300, sh: 800, vi: -500 });
    expect(g(after, "b2").editedAt).toBe(NOW);
    expect(g(after, "b2").createdAt).toBe(g(d, "b2").createdAt);
  });

  it("the strict chip check blocks unbalanced edits (gap + missed-rebuy hint), and validation would too", () => {
    const d = fixture();
    const before = g(d, "b2");
    const over = check(d, before, setStacks({ am: "2800" })(draftFromGame(before)));
    expect(over.ok).toBe(false);
    expect(over.gap).toBe(1000);
    expect(over.hint).toBe("Same as one $1,000 buy-in — missed rebuy?");
    const short = check(d, before, setStacks({ am: "1700" })(draftFromGame(before)));
    expect(short).toMatchObject({ ok: false, gap: -100, hint: null });
    expect(() => migrate(editGameChange({ before, after: over.game, promote: [] })(d))).toThrow(/chip check/);
  });

  it("reports blockers: no buy-in, bad amount, missing stack, fewer than 2 players, date outside the season", () => {
    const d = fixture();
    const before = g(d, "b1");
    const base = draftFromGame(before);
    expect(check(d, before, { ...base, buyIns: { ...base.buyIns, am: [] } }).blockers).toContain("Amit has no buy-in. Add one, or remove them.");
    expect(check(d, before, { ...base, buyIns: { ...base.buyIns, am: [{ amount: "0", index: 0 }] } }).blockers[0]).toMatch(/Amit's buy-ins/);
    expect(check(d, before, setStacks({ sh: "" })(base)).blockers).toContain("Enter Shreyas's final stack (whole dollars, 0 is fine).");
    expect(check(d, before, { ...base, players: ["am"] }).blockers).toContain("A game needs at least 2 players.");
    expect(check(d, before, { ...base, date: "2026-10-05" }).blockers[0]).toMatch(/within its season \(2026-10-11 to 2026-10-20\)/);
    expect(check(d, before, { ...base, date: "2026-10-21" }).blockers[0]).toMatch(/within its season/);
    expect(check(d, before, { ...base, date: "2026-02-30" }).blockers).toContain("Pick a valid date.");
    // A closed season's range ends on its end date.
    const a1 = g(d, "a1");
    expect(check(d, a1, { ...draftFromGame(a1), date: "2026-10-11" }).blockers[0]).toMatch(/2026-10-01 to 2026-10-10/);
  });

  it("an untouched draft is unchanged; rebuys keep their order and times, new ones are appended", () => {
    const d = fixture();
    const before = g(d, "b2");
    expect(check(d, before, draftFromGame(before)).unchanged).toBe(true);
    const draft = draftFromGame(before);
    draft.buyIns.am = [...draft.buyIns.am!, { amount: "500", index: null }];
    draft.buyIns.sh = [{ amount: "1500", index: 1 }];
    draft.stacks = { ...draft.stacks, am: "2300", sh: "1200" };
    const c = check(d, before, draft);
    expect(c.ok).toBe(true);
    expect(c.unchanged).toBe(false);
    expect(c.game.buyIns).toEqual([
      { player: "am", amount: 1000, at: before.buyIns[0]!.at },
      { player: "sh", amount: 1500, at: before.buyIns[1]!.at },
      { player: "vi", amount: 1000, at: before.buyIns[2]!.at },
      { player: "am", amount: 500, at: NOW },
    ]);
  });

  it("adding and removing players", () => {
    const d = fixture();
    const after = applyEdit(d, "b1", (draft) => ({
      ...draft,
      players: [...draft.players, "vi"],
      buyIns: { ...draft.buyIns, vi: [{ amount: "1000", index: null }] },
      stacks: { ...draft.stacks, vi: "1000", am: "400" },
    }));
    expect(g(after, "b1").players).toEqual(["am", "sh", "vi"]);
    const removed = applyEdit(after, "b1", (draft) => {
      const { vi: _vi, ...buyIns } = draft.buyIns;
      return { ...draft, players: ["am", "sh"], buyIns };
    });
    expect(g(removed, "b1").players).toEqual(["am", "sh"]);
    expect(g(removed, "b1").buyIns.some((b) => b.player === "vi")).toBe(false);
    expect(g(removed, "b1").cashOuts.some((c) => c.player === "vi")).toBe(false);
  });

  it("season → incognito takes the game out of the standings; incognito → season puts it back", () => {
    const d = fixture();
    const out = applyEdit(d, "b2", (draft) => ({ ...draft, mode: "incognito" }));
    expect(net(out, "s2")).toEqual({ am: -600, sh: 600, vi: 0 });
    expect(seasonStandings(out, "s2").find((r) => r.playerId === "vi")!.gamesPlayed).toBe(0);
    const back = applyEdit(out, "b2", (draft) => ({ ...draft, mode: "season" }));
    expect(net(back, "s2")).toEqual(net(d, "s2"));
  });

  it("incognito → season with a guest asks the §5.5 choice: promote, or keep it incognito", () => {
    const d = fixture();
    const before = g(d, "b3");
    const toSeason = { ...draftFromGame(before), mode: "season" as const };
    const ask = check(d, before, toSeason);
    expect(ask.ok).toBe(false);
    expect(ask.blockers).toContain("Choose whether to add the guests to the season or keep the game incognito.");
    // A season game with a guest never gets past validation either.
    expect(() => migrate(editGameChange({ before, after: ask.game, promote: [] })(d))).toThrow(/guest/);

    const keep = check(d, before, { ...toSeason, guestChoice: "incognito" });
    expect(keep).toMatchObject({ ok: true, unchanged: true, promote: [] });
    expect(keep.game.mode).toBe("incognito");

    const promote = check(d, before, { ...toSeason, guestChoice: "promote" });
    expect(promote).toMatchObject({ ok: true, unchanged: false, promote: ["gu"] });
    const after = migrate(editGameChange({ before, after: promote.game, promote: promote.promote })(d));
    expect(after.players.find((p) => p.id === "gu")!.type).toBe("regular");
    expect(net(after, "s2")).toEqual({ am: -300, sh: 300, vi: -500, gu: 500 });
  });

  it("adding a guest to a season game asks the same choice", () => {
    const d = fixture();
    const before = g(d, "b1");
    const base = draftFromGame(before);
    const draft: GameDraft = {
      ...base,
      players: [...base.players, "gu"],
      buyIns: { ...base.buyIns, gu: [{ amount: "1000", index: null }] },
      stacks: { ...base.stacks, gu: "1000" },
    };
    expect(check(d, before, draft).ok).toBe(false);
    expect(check(d, before, { ...draft, guestChoice: "incognito" }).game.mode).toBe("incognito");
    expect(check(d, before, { ...draft, guestChoice: "promote" }).promote).toEqual(["gu"]);
  });

  it("editing a game in a closed season changes its computed champion", () => {
    const d = fixture();
    expect(champion(d, "s1")).toBe("am");
    const after = applyEdit(d, "a1", setStacks({ am: "1100", sh: "1600" }));
    expect(champion(after, "s1")).toBe("sh");
  });

  it("duplicate guard: a retry after a lost response changes nothing; a stale edit is refused", () => {
    const d = fixture();
    const before = g(d, "b2");
    const c = check(d, before, setStacks({ am: "1300", sh: "1200" })(draftFromGame(before)));
    const change = editGameChange({ before, after: c.game, promote: [] });
    const saved = migrate(change(d));
    expect(change(saved)).toBe(saved);
    // Someone else changed the game since this admin opened it.
    const other = check(d, before, setStacks({ am: "1700", vi: "600" })(draftFromGame(before)));
    const changedElsewhere = migrate(editGameChange({ before, after: other.game, promote: [] })(d));
    expect(() => change(changedElsewhere)).toThrow("This game changed since you opened it. Reload and edit again.");
    expect(() => change(migrate(deleteGameChange("b2", NOW)(d)))).toThrow(/changed since you opened it/);
  });
});

describe("deleting and restoring", () => {
  it("a deleted game is gone from standings, stats, awards, badges, rank arrows, Last night, history and charts", () => {
    const d = fixture();
    const deleted = migrate(deleteGameChange("b2", NOW)(d));
    expect(g(deleted, "b2")).toMatchObject({ status: "deleted", deletedAt: NOW });
    const without: Data = { ...d, games: d.games.filter((x) => x.id !== "b2") };
    const views: [string, (x: Data) => unknown][] = [
      ["standings", (x) => seasonStandings(x, "s2")],
      ["champion", (x) => champion(x, "s2")],
      ["player stats", (x) => ["am", "sh", "vi"].map((p) => playerSeasonStats(x, "s2", p))],
      ["awards", (x) => seasonAwards(x, "s2")],
      ["summary", (x) => seasonSummary(x, "s2", TODAY)],
      ["badges", (x) => ["am", "sh", "vi"].map((p) => badges(x, p))],
      ["rank arrows", (x) => [...rankChanges(x, "s2")]],
      ["Last night card", (x) => latestFinishedGame(x)?.id],
      ["history", (x) => visibleGames(x).map((y) => y.id)],
      ["same players as last game", (x) => lastGamePlayers(x)],
      ["charts", (x) => ["am", "sh", "vi"].map((p) => netWinningsOverTime(x, "s2", p))],
      ["stats panel", (x) => statsPanelContent(x, TODAY)],
    ];
    for (const [label, view] of views) expect([label, view(deleted)]).toEqual([label, view(without)]);
    expect(deletedGames(deleted).map((x) => x.id)).toEqual(["b2"]);
  });

  it("deleting the latest game moves the Last night card back to the previous game", () => {
    const d = fixture();
    expect(latestFinishedGame(d)?.id).toBe("b3");
    expect(latestFinishedGame(migrate(deleteGameChange("b3", NOW)(d)))?.id).toBe("b2");
  });

  it("restore is exact: deep-equal to the game (and the whole file) before deletion", () => {
    const d = fixture();
    const edited = applyEdit(d, "a1", setStacks({ am: "1100", sh: "1600" }));
    const restored = migrate(restoreGameChange("a1")(migrate(deleteGameChange("a1", NOW)(edited))));
    expect(g(restored, "a1")).toEqual(g(edited, "a1"));
    expect("deletedAt" in g(restored, "a1")).toBe(false);
    expect(restored).toEqual(edited);
  });

  it("deleting a deleted game or restoring a finished one changes nothing (duplicate guard)", () => {
    const d = fixture();
    expect(restoreGameChange("b1")(d)).toBe(d);
    const deleted = migrate(deleteGameChange("b1", NOW)(d));
    expect(deleteGameChange("b1", "2026-10-21T00:00:00.000Z")(deleted)).toBe(deleted);
    expect(() => deleteGameChange("nope", NOW)(d)).toThrow("This game no longer exists.");
  });

  it("deleting and restoring a game in a closed season changes and restores its champion", () => {
    const d = fixture();
    expect(champion(migrate(deleteGameChange("a1", NOW)(d)), "s1")).toBeNull();
    expect(champion(migrate(restoreGameChange("a1")(migrate(deleteGameChange("a1", NOW)(d)))), "s1")).toBe("am");
  });
});

describe("blocked while a game is live or unsynced", () => {
  it("every change refuses while a live marker exists", () => {
    const d = fixture();
    const live: Data = { ...d, liveGame: { gameId: "x", startedAt: NOW } };
    const before = g(d, "b2");
    const c = check(d, before, setStacks({ am: "1300", sh: "1200" })(draftFromGame(before)));
    expect(() => editGameChange({ before, after: c.game, promote: [] })(live)).toThrow(/game is in progress/);
    expect(() => deleteGameChange("b2", NOW)(live)).toThrow(/game is in progress/);
    const deleted = { ...migrate(deleteGameChange("b2", NOW)(d)), liveGame: live.liveGame };
    expect(() => restoreGameChange("b2")(deleted)).toThrow(/game is in progress/);
  });

  it("the screens use the season-action rule: a local game or unsynced games block too", () => {
    const d = fixture();
    expect(seasonActionBlock({ data: d, hasLocalGame: true, queued: 0 })).toMatch(/running on this phone/);
    expect(seasonActionBlock({ data: d, hasLocalGame: false, queued: 2 })).toMatch(/2 unsynced games/);
    expect(seasonActionBlock({ data: d, hasLocalGame: false, queued: 0 })).toBeNull();
  });
});

describe("commit messages (§8.4)", () => {
  it("edit, delete and restore", () => {
    expect(editedGameMessage({ date: "2026-10-19", seasonName: "Season 1", promotedNames: [] })).toBe("Admin: edited game 2026-10-19 (Season 1)");
    expect(editedGameMessage({ date: "2026-10-19", seasonName: "Season 1", promotedNames: ["Rohan"] })).toBe(
      "Admin: edited game 2026-10-19 (Season 1; promoted guest Rohan)",
    );
    expect(editedGameMessage({ date: "2026-10-19", seasonName: "Season 1", promotedNames: ["Rohan", "Raj"] })).toBe(
      "Admin: edited game 2026-10-19 (Season 1; promoted guests Rohan, Raj)",
    );
    expect(deletedGameMessage("2026-10-20", "Season 1")).toBe("Admin: deleted game 2026-10-20 (Season 1)");
    expect(restoredGameMessage("2026-10-20", "Season 1")).toBe("Admin: restored game 2026-10-20 (Season 1)");
  });
});

describe("the write path", () => {
  // An in-memory data.json with a sha, like the sandbox backend.
  function memoryBackend(initial: Data, loseFirstResponse = false) {
    let current = { sha: "sha0", data: initial };
    let puts = 0;
    const backend: WriteBackend = {
      fetchCurrent: async () => current,
      put: async (next, sha) => {
        if (sha !== current.sha) return { ok: false, status: 409, message: "conflict" };
        puts++;
        current = { sha: `sha${puts}`, data: migrate(JSON.parse(JSON.stringify(next))) };
        if (loseFirstResponse && puts === 1) throw new Error("network dropped");
        return { ok: true, commitSha: current.sha };
      },
    };
    return { backend, puts: () => puts, data: () => current.data };
  }

  it("an edit retried after a lost response makes no second commit", async () => {
    const d = fixture();
    const before = g(d, "b2");
    const c = check(d, before, setStacks({ am: "1300", sh: "1200" })(draftFromGame(before)));
    const change = editGameChange({ before, after: c.game, promote: [] });
    const mem = memoryBackend(d, true);
    await expect(saveWith(mem.backend, change, "Admin: edited game")).rejects.toThrow("network dropped");
    const retry = await saveWith(mem.backend, change, "Admin: edited game");
    expect(retry.unchanged).toBe(true);
    expect(mem.puts()).toBe(1);
    expect(net(mem.data(), "s2")).toEqual({ am: -300, sh: 800, vi: -500 });
  });

  it("an unbalanced edit never reaches the file", async () => {
    const d = fixture();
    const before = g(d, "b2");
    const c = check(d, before, setStacks({ am: "9999" })(draftFromGame(before)));
    const mem = memoryBackend(d);
    await expect(saveWith(mem.backend, editGameChange({ before, after: c.game, promote: [] }), "x")).rejects.toThrow(/chip check/);
    expect(mem.puts()).toBe(0);
  });
});

describe("zero-sum invariant after random edits, deletes and restores", () => {
  function seededRandom(seed: number) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("the season's net winnings always sum to $0", () => {
    const seed = 51;
    const rand = seededRandom(seed);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
    let d = fixture();
    let edits = 0;
    for (let step = 0; step < 300; step++) {
      const target = pick(d.games);
      const action = rand();
      try {
        if (target.status === "deleted") d = migrate(restoreGameChange(target.id)(d));
        else if (action < 0.15) d = migrate(deleteGameChange(target.id, NOW)(d));
        else {
          d = applyEdit(d, target.id, (draft) => {
            const [from, to] = [pick(draft.players), pick(draft.players)];
            const move = Math.min(Number(draft.stacks[from!]), Math.floor(rand() * 800));
            const stacks = { ...draft.stacks };
            stacks[from!] = String(Number(stacks[from!]) - move);
            stacks[to!] = String(Number(stacks[to!]) + move);
            // A rebuy for someone, with their stack raised to match.
            const buyIns = { ...draft.buyIns };
            if (rand() < 0.3) {
              const p = pick(draft.players);
              const amount = 1 + Math.floor(rand() * 2000);
              buyIns[p] = [...buyIns[p]!, { amount: String(amount), index: null }];
              stacks[p] = String(Number(stacks[p]) + amount);
            }
            const mode = rand() < 0.2 ? (draft.mode === "season" ? "incognito" : "season") : draft.mode;
            return { ...draft, stacks, buyIns, mode, guestChoice: "promote" };
          });
        }
      } catch (err) {
        throw new Error(`step ${step} failed with seed ${seed}: ${err instanceof Error ? err.message : String(err)}`);
      }
      for (const s of ["s1", "s2"]) {
        const total = seasonStandings(d, s).reduce((sum, r) => sum + r.net, 0);
        if (total !== 0) throw new Error(`Zero-sum invariant failed with seed ${seed} at step ${step}: ${s} total ${total}`);
      }
      if (target.status !== "deleted" && action >= 0.15) edits++;
    }
    expect(edits).toBeGreaterThan(150);
    expect(d.games.every((x) => x.editedAt)).toBe(true);
  });
});
